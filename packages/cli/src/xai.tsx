/**
 * @license
 * Copyright 2025 alby13
 * SPDX-License-Identifier: Apache-2.0
 *
 * This file has been refactored to be the main entry point for the Grok CLI,
 * using the XaiClient for its core logic. It handles both interactive UI mode
 * and non-interactive command execution.
 */

import React from 'react';
import { render } from 'ink';
import { AppWrapper } from './ui/App.js';
import { loadCliConfig } from './config/config.js';
import { readStdin } from './utils/readStdin.js';
import { basename } from 'node:path';
import v8 from 'node:v8';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { start_sandbox } from './utils/sandbox.js';
import { LoadedSettings, loadSettings, SettingScope } from './config/settings.js';
import { themeManager } from './ui/themes/theme-manager.js';
import { getStartupWarnings } from './utils/startupWarnings.js';
import { loadExtensions } from './config/extension.js';
import { cleanupCheckpoints } from './utils/cleanup.js';
import {
  XaiClient,
  CoreToolScheduler,
  Turn,
  sessionId,
  logUserPrompt,
  AuthType,
  Config,
} from '@alby13/grok-cli-core';
import { validateAuthMethod } from './config/auth.js';
import { setMaxSizedBoxDebugging } from './ui/components/shared/MaxSizedBox.js';

function getNodeMemoryArgs(config: Config): string[] {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const heapStats = v8.getHeapStatistics();
  const currentMaxOldSpaceSizeMb = Math.floor(heapStats.heap_size_limit / 1024 / 1024);
  const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * 0.5);

  if (config.getDebugMode()) {
    console.debug(`Current heap size ${currentMaxOldSpaceSizeMb.toFixed(2)} MB`);
  }

  if (process.env.GROK_CLI_NO_RELAUNCH) {
    return [];
  }

  if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
    if (config.getDebugMode()) {
      console.debug(`Need to relaunch with more memory: ${targetMaxOldSpaceSizeInMB.toFixed(2)} MB`);
    }
    return [`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`];
  }

  return [];
}

async function relaunchWithAdditionalArgs(additionalArgs: string[]) {
  const nodeArgs = [...additionalArgs, ...process.argv.slice(1)];
  const newEnv = { ...process.env, GROK_CLI_NO_RELAUNCH: 'true' };
  const child = spawn(process.execPath, nodeArgs, { stdio: 'inherit', env: newEnv });
  await new Promise((resolve) => child.on('close', resolve));
  process.exit(0);
}

export async function main() {
  const workspaceRoot = process.cwd();
  const settings = loadSettings(workspaceRoot);

  await cleanupCheckpoints();
  if (settings.errors.length > 0) {
    for (const error of settings.errors) {
      console.error(`Error in ${error.path}: ${error.message}`);
      console.error(`Please fix ${error.path} and try again.`);
    }
    process.exit(1);
  }

  const extensions = loadExtensions(workspaceRoot);
  const config = await loadCliConfig(settings.merged, extensions, sessionId);

  // Set default fallback to Grok api key. Assumes AuthType.USE_XAI exists.
  if (!settings.merged.selectedAuthType && process.env.GROK_API_KEY) {
    settings.setValue(SettingScope.User, 'selectedAuthType', AuthType.USE_XAI);
  }

  setMaxSizedBoxDebugging(config.getDebugMode());

  config.getFileService();
  if (config.getCheckpointingEnabled()) {
    try { await config.getGitService(); } catch { /* Swallow error */ }
  }

  if (settings.merged.theme) {
    if (!themeManager.setActiveTheme(settings.merged.theme)) {
      console.warn(`Warning: Theme "${settings.merged.theme}" not found.`);
    }
  }

  const memoryArgs = settings.merged.autoConfigureMaxOldSpaceSize ? getNodeMemoryArgs(config) : [];

  if (!process.env.SANDBOX) {
    const sandboxConfig = config.getSandbox();
    if (sandboxConfig) {
      if (settings.merged.selectedAuthType) {
        try {
          const err = validateAuthMethod(settings.merged.selectedAuthType);
          if (err) throw new Error(err);
          await config.refreshAuth(settings.merged.selectedAuthType);
        } catch (err) {
          console.error('Error authenticating:', err);
          process.exit(1);
        }
      }
      await start_sandbox(sandboxConfig, memoryArgs);
      process.exit(0);
    } else if (memoryArgs.length > 0) {
      await relaunchWithAdditionalArgs(memoryArgs);
      process.exit(0);
    }
  }

  let input = config.getQuestion();
  const startupWarnings = await getStartupWarnings();

  // --- Main Application Logic ---

  // MODE 1: Interactive UI Mode
  // If we are in an interactive terminal with no initial question, render the UI.
  if (process.stdin.isTTY && input?.length === 0) {
    setWindowTitle(basename(workspaceRoot), settings);
    render(
      <React.StrictMode>
        {/* The AppWrapper will need its own refactoring to use XaiClient */}
        <AppWrapper config={config} settings={settings} startupWarnings={startupWarnings} />
      </React.StrictMode>,
      { exitOnCtrlC: false },
    );
    return;
  }

  // MODE 2: Non-Interactive (Direct Command) Mode
  // If not a TTY, read from stdin for piped input.
  if (!process.stdin.isTTY) {
    input += await readStdin();
  }

  if (!input) {
    console.error('No input provided via command-line or stdin.');
    process.exit(1);
  }

  console.log('Running in non-interactive mode...');

  // Step 1: Authenticate for non-interactive mode
  try {
    const authType = settings.merged.selectedAuthType || AuthType.USE_XAI;
    const err = validateAuthMethod(authType);
    if (err) throw new Error(err);
    await config.refreshAuth(authType);
  } catch(err) {
    console.error(`Authentication failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  
  // Step 2: Setup Client and Scheduler
  const client = new XaiClient(config);
  await client.initialize();

  const scheduler = new CoreToolScheduler({
    toolRegistry: client.getConfig().getToolRegistry(),
    config: client.getConfig(),
    onAllToolCallsComplete: (toolMessages) => {
      console.log('\nAll tools finished. Sending results back to the model...');
      for (const toolMessage of toolMessages) {
        client.addHistory(toolMessage);
      }
      // Continue the conversation with the tool results now in history.
      runConversation('Please analyze the results of the tools I just ran and continue with the task.');
    },
  });

  // Step 3: Define the main conversation loop
  async function runConversation(prompt: string) {
    logUserPrompt(config, {
      'event.name': 'user_prompt',
      'event.timestamp': new Date().toISOString(),
      prompt: prompt,
      prompt_length: prompt.length,
    });
    
    const stream = client.sendMessageStream(prompt, new AbortController().signal);
    let finalTurn: Turn | undefined;

    try {
      for await (const event of stream) {
        if (event.type === 'contentDelta') {
          process.stdout.write(event.value);
        }
        // Could add more detailed logging for other event types here if needed.
      }
      const streamResult = await stream.next(); // Await the final value from the generator
      finalTurn = streamResult.value;
    } catch (error) {
      console.error("\nAn error occurred during the conversation:", error);
      process.exit(1);
    }
    
    // Step 4: Check for tool calls and either schedule them or exit.
    if (finalTurn && finalTurn.pendingToolCalls.length > 0) {
      console.log(`\nModel requested ${finalTurn.pendingToolCalls.length} tool(s). Scheduling execution...`);
      // The scheduler now takes over. When done, it calls onAllToolCallsComplete, which continues the loop.
      await scheduler.schedule(finalTurn.pendingToolCalls, new AbortController().signal);
    } else {
      // If there are no more tool calls, the task is complete.
      console.log('\n\nTask complete.');
      process.exit(0);
    }
  }

  // Step 5: Start the conversation with the initial input.
  await runConversation(input);
}

function setWindowTitle(title: string, settings: LoadedSettings) {
  if (!settings.merged.hideWindowTitle) {
    process.stdout.write(`\x1b]2; XAI CLI - ${title} \x07`);
    process.on('exit', () => {
      process.stdout.write(`\x1b]2;\x07`);
    });
  }
}

// Global handler for any unexpected promise rejections.
process.on('unhandledRejection', (reason, _promise) => {
  console.error('\n=========================================');
  console.error('CRITICAL: Unhandled Promise Rejection!');
  console.error('=========================================');
  console.error('Reason:', reason);
  if (!(reason instanceof Error)) {
    console.error(reason);
  }
  process.exit(1);
});
