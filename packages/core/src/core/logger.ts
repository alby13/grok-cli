/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getProjectTempDir } from '../utils/paths.js'; // Assumes this utility is updated or generic

const LOG_FILE_NAME = 'logs.json';
const CHECKPOINT_FILE_NAME = 'checkpoint.json';

export enum MessageSenderType {
  USER = 'user',
}

export interface LogEntry {
  sessionId: string;
  messageId: number;
  timestamp: string;
  type: MessageSenderType;
  message: string;
}

export class Logger {
  private logDir: string | undefined; // Renamed from geminiDir
  private logFilePath: string | undefined;
  private checkpointFilePath: string | undefined;
  private sessionId: string | undefined;
  private messageId = 0;
  private initialized = false;
  private logs: LogEntry[] = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  private async _readLogFile(): Promise<LogEntry[]> {
    if (!this.logFilePath) {
      throw new Error('Log file path not set during read attempt.');
    }
    try {
      const fileContent = await fs.readFile(this.logFilePath, 'utf-8');
      const parsedLogs = JSON.parse(fileContent);
      if (!Array.isArray(parsedLogs)) {
        console.debug(
          `Log file at ${this.logFilePath} is not a valid JSON array. Starting with empty logs.`,
        );
        await this._backupCorruptedLogFile('malformed_array');
        return [];
      }
      return parsedLogs.filter(
        (entry) =>
          typeof entry.sessionId === 'string' &&
          typeof entry.messageId === 'number' &&
          typeof entry.timestamp === 'string' &&
          typeof entry.type === 'string' &&
          typeof entry.message === 'string',
      ) as LogEntry[];
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return [];
      }
      if (error instanceof SyntaxError) {
        console.debug(
          `Invalid JSON in log file ${this.logFilePath}. Backing up and starting fresh.`,
          error,
        );
        await this._backupCorruptedLogFile('invalid_json');
        return [];
      }
      console.debug(
        `Failed to read or parse log file ${this.logFilePath}:`,
        error,
      );
      throw error;
    }
  }

  private async _backupCorruptedLogFile(reason: string): Promise<void> {
    if (!this.logFilePath) return;
    const backupPath = `${this.logFilePath}.${reason}.${Date.now()}.bak`;
    try {
      await fs.rename(this.logFilePath, backupPath);
      console.debug(`Backed up corrupted log file to ${backupPath}`);
    } catch (_backupError) {
      // If rename fails (e.g. file doesn't exist), no need to log an error here as the primary error is already handled.
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // The getProjectTempDir function should point to something like `.xai/temp`
    this.logDir = getProjectTempDir(process.cwd());
    this.logFilePath = path.join(this.logDir, LOG_FILE_NAME);
    this.checkpointFilePath = path.join(this.logDir, CHECKPOINT_FILE_NAME);

    try {
      await fs.mkdir(this.logDir, { recursive: true });
      let fileExisted = true;
      try {
        await fs.access(this.logFilePath);
      } catch (_e) {
        fileExisted = false;
      }
      this.logs = await this._readLogFile();
      if (!fileExisted && this.logs.length === 0) {
        await fs.writeFile(this.logFilePath, '[]', 'utf-8');
      }
      const sessionLogs = this.logs.filter(
        (entry) => entry.sessionId === this.sessionId,
      );
      this.messageId =
        sessionLogs.length > 0
          ? Math.max(...sessionLogs.map((entry) => entry.messageId)) + 1
          : 0;
      this.initialized = true;
    } catch (err) {
      console.error('Failed to initialize logger:', err);
      this.initialized = false;
    }
  }

  private async _updateLogFile(
    entryToAppend: LogEntry,
  ): Promise<LogEntry | null> {
    if (!this.logFilePath) {
      console.debug('Log file path not set. Cannot persist log entry.');
      throw new Error('Log file path not set during update attempt.');
    }

    let currentLogsOnDisk: LogEntry[];
    try {
      currentLogsOnDisk = await this._readLogFile();
    } catch (readError) {
      console.debug(
        'Critical error reading log file before append:',
        readError,
      );
      throw readError;
    }

    const sessionLogsOnDisk = currentLogsOnDisk.filter(
      (e) => e.sessionId === entryToAppend.sessionId,
    );
    const nextMessageIdForSession =
      sessionLogsOnDisk.length > 0
        ? Math.max(...sessionLogsOnDisk.map((e) => e.messageId)) + 1
        : 0;

    entryToAppend.messageId = nextMessageIdForSession;

    const entryExists = currentLogsOnDisk.some(
      (e) =>
        e.sessionId === entryToAppend.sessionId &&
        e.messageId === entryToAppend.messageId &&
        e.timestamp === entryToAppend.timestamp &&
        e.message === entryToAppend.message,
    );

    if (entryExists) {
      console.debug(
        `Duplicate log entry detected and skipped: session ${entryToAppend.sessionId}, messageId ${entryToAppend.messageId}`,
      );
      this.logs = currentLogsOnDisk;
      return null;
    }

    currentLogsOnDisk.push(entryToAppend);

    try {
      await fs.writeFile(
        this.logFilePath,
        JSON.stringify(currentLogsOnDisk, null, 2),
        'utf-8',
      );
      this.logs = currentLogsOnDisk;
      return entryToAppend;
    } catch (error) {
      console.debug('Error writing to log file:', error);
      throw error;
    }
  }

  async getPreviousUserMessages(): Promise<string[]> {
    if (!this.initialized) return [];
    return this.logs
      .filter((entry) => entry.type === MessageSenderType.USER)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .map((entry) => entry.message);
  }

  async logMessage(type: MessageSenderType, message: string): Promise<void> {
    if (!this.initialized || this.sessionId === undefined) {
      console.debug(
        'Logger not initialized or session ID missing. Cannot log message.',
      );
      return;
    }

    const newEntryObject: LogEntry = {
      sessionId: this.sessionId,
      messageId: this.messageId,
      type,
      message,
      timestamp: new Date().toISOString(),
    };

    try {
      const writtenEntry = await this._updateLogFile(newEntryObject);
      if (writtenEntry) {
        this.messageId = writtenEntry.messageId + 1;
      }
    } catch (_error) {
      // Error already logged by internal methods.
    }
  }

  _checkpointPath(tag: string | undefined): string {
    if (!this.checkpointFilePath || !this.logDir) {
      throw new Error('Checkpoint file path not set.');
    }
    if (!tag) {
      return this.checkpointFilePath;
    }
    return path.join(this.logDir, `checkpoint-${tag}.json`);
  }

  /**
   * Saves a conversation checkpoint.
   * @param conversation The conversation history, formatted for the OpenAI API.
   * @param tag An optional tag for the checkpoint file name.
   */
  async saveCheckpoint(
    conversation: ChatCompletionMessageParam[],
    tag?: string,
  ): Promise<void> {
    if (!this.initialized || !this.checkpointFilePath) {
      console.error(
        'Logger not initialized. Cannot save a checkpoint.',
      );
      return;
    }
    const path = this._checkpointPath(tag);
    try {
      await fs.writeFile(path, JSON.stringify(conversation, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error writing to checkpoint file:', error);
    }
  }

  /**
   * Loads a conversation checkpoint.
   * @param tag An optional tag for the checkpoint file name.
   * @returns The conversation history, formatted for the OpenAI API.
   */
  async loadCheckpoint(tag?: string): Promise<ChatCompletionMessageParam[]> {
    if (!this.initialized || !this.checkpointFilePath) {
      console.error(
        'Logger not initialized. Cannot load checkpoint.',
      );
      return [];
    }

    const path = this._checkpointPath(tag);

    try {
      const fileContent = await fs.readFile(path, 'utf-8');
      const parsedContent = JSON.parse(fileContent);
      if (!Array.isArray(parsedContent)) {
        console.warn(
          `Checkpoint file at ${path} is not a valid JSON array. Returning empty checkpoint.`,
        );
        return [];
      }
      return parsedContent as ChatCompletionMessageParam[];
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return [];
      }
      console.error(`Failed to read or parse checkpoint file ${path}:`, error);
      return [];
    }
  }

  close(): void {
    this.initialized = false;
    this.logFilePath = undefined;
    this.checkpointFilePath = undefined;
    this.logs = [];
    this.sessionId = undefined;
    this.messageId = 0;
  }
}
