/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import Groq from 'groq-sdk';
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'groq-sdk/resources/chat/completions';

// Assuming these local modules are refactored to be compatible with the Groq API.
import { getFolderStructure } from '../utils/getFolderStructure.js';
import { Turn } from './turn.js'; // Note: `Turn` class will require significant refactoring.
import {
  ServerGrokStreamEvent,
  GrokEventType,
  ChatCompressionInfo,
} from './turn.js'; // Assuming `turn.ts` is updated with new event types.
import { Config } from '../config/config.js';
import { getCoreSystemPrompt } from './prompts.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { reportError } from '../utils/errorReporting.js';
import { getErrorMessage } from '../utils/errors.js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

// Define a placeholder for the response type to maintain structural similarity.
// In a real scenario, you'd map the Groq response to this structure.
type GenerateContentResponse = Groq.Chat.Completions.ChatCompletion;

export class GrokClient {
  private groq: Groq;
  private history: ChatCompletionMessageParam[] = [];
  private model: string;
  // Note: Groq does not provide an embedding model via this API.
  // This property is kept for structural consistency, but generateEmbedding will fail.
  private embeddingModel: string;
  private generateContentConfig = {
    temperature: 0,
    topP: 1,
  };
  private readonly MAX_TURNS = 100;

  constructor(private config: Config) {
    if (config.getProxy()) {
      // The Groq SDK uses node-fetch, which respects standard proxy env vars.
      // For more complex proxy scenarios, a custom HTTP agent might be needed.
      setGlobalDispatcher(new ProxyAgent(config.getProxy() as string));
    }

    this.groq = new Groq({
      apiKey: this.config.getApiKey(), // Assumes config provides a Groq API key.
    });
    this.model = config.getModel();
    this.embeddingModel = config.getEmbeddingModel();
  }

  async initialize(): Promise<void> {
    this.history = await this.createInitialHistory();
  }

  // Helper to ensure initialization has happened.
  private ensureInitialized(): void {
    if (this.history.length === 0) {
      throw new Error(
        'Client not initialized. Please call initialize() first.',
      );
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
        content:
          'I have provided my environment context in the system prompt. Acknowledge this and wait for my next instruction.',
      },
      {
        role: 'assistant',
        content: 'Got it. Thanks for the context! I am ready to help.',
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
This is a CLI tool powered by a Large Language Model. We are setting up the context for our chat.
Today's date is ${today}.
My operating system is: ${platform}
I'm currently working in the directory: ${cwd}
Here is the structure of my current directory:
${folderStructure}
    `.trim();

    // Add full file context if the flag is set
    if (this.config.getFullContext()) {
      try {
        const toolRegistry = await this.config.getToolRegistry();
        const readManyFilesTool = toolRegistry.getTool(
          'read_many_files',
        ) as ReadManyFilesTool;
        if (readManyFilesTool) {
          const result = await readManyFilesTool.execute(
            { paths: ['**/*'], useDefaultExcludes: true },
            AbortSignal.timeout(30000),
          );
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
  ): AsyncGenerator<ServerGrokStreamEvent, Turn> {
    this.ensureInitialized();

    if (!turns) {
      return new Turn(this); // Return a turn representing the current state.
    }

    // Context compression check
    const compressed = await this.tryCompressChat();
    if (compressed) {
      yield { type: GrokEventType.ChatCompressed, value: compressed };
    }

    this.history.push({ role: 'user', content: request });

    const turn = new Turn(this); // `Turn` class will need to be adapted for Groq.
    const resultStream = turn.run(this.history, signal); // `run` should now call Groq.

    for await (const event of resultStream) {
      yield event;
    }

    // After the stream, the Turn object should contain the full response,
    // which should be added to history.
    if (turn.getFinalAssistantMessage()) {
      this.history.push(turn.getFinalAssistantMessage());
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
    // Groq doesn't use a programmatic schema, but we can use the description.
    schemaDescription: string,
    abortSignal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    try {
      const systemPrompt = `You are a helpful assistant designed to output only valid JSON. The JSON you provide must conform to this description: ${schemaDescription}. Do not include any other text or markdown formatting in your response.`;
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];

      const result = await this.groq.chat.completions.create(
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
      await reportError(error, 'Error generating JSON content via Groq API.');
      throw new Error(`Failed to generate JSON content: ${getErrorMessage(error)}`);
    }
  }

  async generateContent(
    contents: ChatCompletionMessageParam[],
    abortSignal: AbortSignal,
  ): Promise<GenerateContentResponse> {
    try {
      const result = await this.groq.chat.completions.create(
        {
          model: this.model,
          messages: contents,
          ...this.generateContentConfig,
        },
        { signal: abortSignal },
      );
      return result;
    } catch (error) {
      if (abortSignal.aborted) throw error;
      await reportError(error, 'Error generating content via Groq API.');
      throw new Error(`Failed to generate content: ${getErrorMessage(error)}`);
    }
  }

  async generateEmbedding(texts: string[]): Promise<number[][]> {
    // The Groq SDK for Node.js does not currently support an embedding endpoint.
    // This function is left as a placeholder and will throw an error.
    // To use embeddings, you must integrate a third-party embedding service
    // (e.g., Voyage AI, Cohere, OpenAI) or a local sentence-transformer library.
    throw new Error(
      `Not Implemented: Groq does not provide an embedding API. Texts: ${texts.join(', ')}`,
    );
  }

  async tryCompressChat(force: boolean = false): Promise<ChatCompressionInfo | null> {
    // Note: This uses message count as a heuristic for token count.
    // For production, use a library like `tiktoken` for accurate counting.
    const originalMessageCount = this.history.length;
    const compressionThreshold = 20; // Example threshold: compress if > 20 messages.

    if (originalMessageCount === 0) {
      return null;
    }

    if (!force && originalMessageCount < compressionThreshold) {
      return null;
    }

    try {
      const summarizationPrompt =
        'Summarize our conversation up to this point. The summary should be a concise yet comprehensive overview of all key topics, questions, answers, and important details discussed. This summary will replace the current chat history to conserve tokens, so it must capture everything essential to understand the context and continue our conversation effectively as if no information was lost.';

      const summarizationResponse = await this.groq.chat.completions.create({
        model: this.model,
        messages: [
          ...this.history,
          { role: 'user', content: summarizationPrompt },
        ],
      });

      const summaryText = summarizationResponse.choices[0].message.content;

      if (!summaryText) {
        console.warn('Chat compression failed: received empty summary.');
        return null;
      }

      const newHistory = await this.createInitialHistory();
      newHistory.push({
        role: 'user',
        content: `The previous conversation has been summarized to save space. Here is the summary:\n\n${summaryText}`,
      });
      newHistory.push({
        role: 'assistant',
        content:
          'Thank you for the summary. I have updated my context and am ready to continue.',
      });

      this.history = newHistory;
      const newMessageCount = this.history.length;

      // Returning message counts as a proxy for token counts.
      return {
        originalTokenCount: originalMessageCount,
        newTokenCount: newMessageCount,
      };
    } catch (error) {
      await reportError(error, 'Failed to compress chat history.');
      return null;
    }
  }

  // This is a helper method that the refactored `Turn` class would use.
  async createChatCompletionStream(
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[] | undefined,
    signal: AbortSignal,
  ): Promise<AsyncIterable<Groq.Chat.Completions.ChatCompletionChunk>> {
    return this.groq.chat.completions.create(
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
