/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import OpenAI from 'openai';
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

// Assuming these local modules are refactored to be provider-agnostic
// or compatible with the OpenAI SDK's data structures.
import { getFolderStructure } from '../utils/getFolderStructure.js';
import { Turn } from './turn.js'; // Note: The `Turn` class will require significant refactoring.
import { ServerStreamEvent, EventType, ChatCompressionInfo } from './turn.js'; // Assumes `turn.ts` is updated.
import { Config } from '../config/config.js';
import { getCoreSystemPrompt } from './prompts.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { reportError } from '../utils/errorReporting.js';
import { getErrorMessage } from '../utils/errors.js';

// Define a placeholder for the response type to maintain structural similarity.
type GenerateContentResponse = OpenAI.Chat.Completions.ChatCompletion;

export class XaiClient {
  private openAIClient: OpenAI;
  private history: ChatCompletionMessageParam[] = [];
  private model: string;
  private embeddingModel: string;
  private generateContentConfig = {
    temperature: 0.7, // Using a more standard default for creative models
    top_p: 1,
  };
  private readonly MAX_TURNS = 100;

  constructor(private config: Config) {
    // This is the correct implementation for initializing the client for xAI.
    const apiKey = this.config.getApiKey(); // Assumes config retrieves the XAI API key
    if (!apiKey) {
      throw new Error('XAI_API_KEY environment variable is not set or configured.');
    }
    this.openAIClient = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.x.ai/v1',
    });

    this.model = config.getModel(); // e.g., 'grok-1'
    this.embeddingModel = config.getEmbeddingModel(); // e.g., an xAI embedding model name
  }

  async initialize(): Promise<void> {
    this.history = await this.createInitialHistory();
  }

  private ensureInitialized(): void {
    if (this.history.length === 0) {
      throw new Error('Client not initialized. Please call initialize() first.');
    }
  }

  async addHistory(content: ChatCompletionMessageParam): Promise<void> {
    this.ensureInitialized();
    this.history.push(content);
  }

  getHistory(): ChatCompletionMessageParam[] {
    this.ensureInitialized();
    return [...this.history];
  }

  async setHistory(history: ChatCompletionMessageParam[]): Promise<void> {
    this.history = history;
  }

  async resetChat(): Promise<void> {
    await this.initialize();
  }

  private async createInitialHistory(): Promise<ChatCompletionMessageParam[]> {
    const systemPrompt = await this.getSystemPrompt();
    const userMemory = this.config.getUserMemory();

    return [
      {
        role: 'system',
        content: `${systemPrompt}\n\n${getCoreSystemPrompt(userMemory)}`,
      },
      {
        role: 'user',
        content: 'I have provided my environment context in the system prompt. Acknowledge this and wait for my next instruction.',
      },
      {
        role: 'assistant',
        content: 'Context acknowledged. I am ready for your command.',
      },
    ];
  }

  private async getSystemPrompt(): Promise<string> {
    const cwd = this.config.getWorkingDir();
    const today = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const platform = process.platform;
    const folderStructure = await getFolderStructure(cwd, {
      fileService: this.config.getFileService(),
    });
    let context = `
This is a CLI tool powered by a Large Language Model from xAI.
Today's date is ${today}.
My operating system is: ${platform}
I'm currently working in the directory: ${cwd}
Here is the structure of my current directory:
${folderStructure}
    `.trim();

    if (this.config.getFullContext()) {
      try {
        const toolRegistry = await this.config.getToolRegistry();
        const readManyFilesTool = toolRegistry.getTool('read_many_files') as ReadManyFilesTool;
        if (readManyFilesTool) {
          const result = await readManyFilesTool.execute({ paths: ['**/*'], useDefaultExcludes: true }, AbortSignal.timeout(30000));
          if (result.llmContent) {
            context += `\n\n--- Full File Context ---\n${result.llmContent}`;
          }
        }
      } catch (error) {
        console.error('Error reading full file context:', error);
        context += '\n\n--- Error reading full file context ---';
      }
    }

    return context;
  }

  async *sendMessageStream(
    request: string,
    signal: AbortSignal,
    turns: number = this.MAX_TURNS,
  ): AsyncGenerator<ServerStreamEvent, Turn> {
    this.ensureInitialized();

    if (!turns) {
      return new Turn(this);
    }

    const compressed = await this.tryCompressChat();
    if (compressed) {
      yield { type: EventType.ChatCompressed, value: compressed };
    }

    this.history.push({ role: 'user', content: request });

    // The `Turn` class must be refactored to use this client's `createChatCompletionStream` method.
    const turn = new Turn(this);
    const resultStream = turn.run(this.history, signal);

    for await (const event of resultStream) {
      yield event;
    }

    // After the stream, the Turn object should contain the full assistant message.
    const finalMessage = turn.getFinalAssistantMessage();
    if (finalMessage) {
      this.history.push(finalMessage);
    }

    if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
      const nextSpeakerCheck = await checkNextSpeaker(this, signal);
      if (nextSpeakerCheck?.next_speaker === 'model') {
        yield* this.sendMessageStream('Please continue.', signal, turns - 1);
      }
    }

    return turn;
  }

  async generateJson(
    prompt: string,
    schemaDescription: string,
    abortSignal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    try {
      const systemPrompt = `You are a helpful assistant designed to output only valid JSON. The JSON you provide must conform to this description: ${schemaDescription}. Do not include any other text, markdown formatting, or explanations in your response.`;
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];

      const result = await this.openAIClient.chat.completions.create(
        {
          model: this.model,
          messages,
          response_format: { type: 'json_object' },
          ...this.generateContentConfig,
        },
        { signal: abortSignal },
      );

      const text = result.choices[0]?.message?.content;
      if (!text) {
        throw new Error('API returned an empty response for generateJson.');
      }
      return JSON.parse(text);
    } catch (error) {
      if (abortSignal.aborted) throw error;
      await reportError(error, 'Error generating JSON content via xAI API.');
      throw new Error(`Failed to generate JSON content: ${getErrorMessage(error)}`);
    }
  }

  async generateEmbedding(texts: string[]): Promise<number[][]> {
    if (!this.embeddingModel) {
      throw new Error("An embedding model name must be configured to use generateEmbedding.");
    }
    if (!texts || texts.length === 0) {
      return [];
    }
    
    try {
      const response = await this.openAIClient.embeddings.create({
        model: this.embeddingModel,
        input: texts.map(text => text.replace(/\n/g, ' ')), // API may have issues with newlines
      });
      return response.data.map(item => item.embedding);
    } catch (error) {
       await reportError(error, 'Error generating embeddings via xAI API.');
       throw new Error(`Failed to generate embeddings: ${getErrorMessage(error)}`);
    }
  }

  async tryCompressChat(force: boolean = false): Promise<ChatCompressionInfo | null> {
    // This is a simple heuristic. For precise control, integrate a library like `tiktoken`.
    const originalMessageCount = this.history.length;
    const compressionThreshold = 25;

    if (originalMessageCount === 0 || (!force && originalMessageCount < compressionThreshold)) {
      return null;
    }

    try {
      const summarizationPrompt = 'Summarize our conversation up to this point. The summary should be a concise yet comprehensive overview of all key topics, questions, code, and important details. This summary will replace the current chat history, so it must capture everything essential for context.';
      const summarizationResponse = await this.openAIClient.chat.completions.create({
        model: this.model,
        messages: [...this.history, { role: 'user', content: summarizationPrompt }],
      });
      const summaryText = summarizationResponse.choices[0].message.content;

      if (!summaryText) return null;

      const newHistory = await this.createInitialHistory();
      newHistory.push({
        role: 'user',
        content: `The previous conversation has been summarized. Here is the summary:\n\n${summaryText}`,
      });
      newHistory.push({ role: 'assistant', content: 'Thank you for the summary. My context is updated.' });

      this.history = newHistory;
      return {
        originalTokenCount: originalMessageCount,
        newTokenCount: this.history.length,
      };
    } catch (error) {
      await reportError(error, 'Failed to compress chat history.');
      return null;
    }
  }

  // This helper is intended to be called by a refactored `Turn` class.
  async createChatCompletionStream(
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[] | undefined,
    signal: AbortSignal,
  ): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    return this.openAIClient.chat.completions.create(
      {
        model: this.model,
        messages: messages,
        tools: tools,
        tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
        stream: true,
        ...this.generateContentConfig,
      },
      { signal },
    );
  }
}
