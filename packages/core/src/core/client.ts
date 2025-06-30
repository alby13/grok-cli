/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  // EmbedContentParameters, // To be replaced by OpenAI/Grok SDK types
  // GenerateContentConfig, // To be replaced by OpenAI/Grok SDK types
  // Part, // To be replaced by OpenAI/Grok SDK types
  // SchemaUnion, // To be replaced by OpenAI/Grok SDK types
  // PartListUnion, // To be replaced by OpenAI/Grok SDK types
  // Content, // To be replaced by OpenAI/Grok SDK types
  // Tool, // To be replaced by OpenAI/Grok SDK types
  // GenerateContentResponse, // To be replaced by OpenAI/Grok SDK types
} from '@google/genai'; // This import will likely be removed or replaced entirely

import OpenAI from 'openai';

// Placeholder types, to be replaced by actual OpenAI/Grok SDK types
// type EmbedContentParameters = any; // Will be OpenAI.EmbeddingCreateParams
type GenerateContentConfig = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming; // Or Streaming
type Part = OpenAI.Chat.Completions.ChatCompletionContentPart; // For message content parts, primarily text or image
type SchemaUnion = any; // For JSON mode, this will be a JSON schema
type PartListUnion = string | OpenAI.Chat.Completions.ChatCompletionContentPart[]; // User input can be simple string or more complex
type Content = OpenAI.Chat.Completions.ChatCompletionMessageParam; // For history and messages
type Tool = OpenAI.Chat.Completions.ChatCompletionTool;
type GenerateContentResponse = OpenAI.Chat.Completions.ChatCompletion;
type GenerateContentResponseUsageMetadata = OpenAI.CompletionUsage;

import { getFolderStructure } from '../utils/getFolderStructure.js';
import {
  Turn,
  ServerGrokStreamEvent, // Already updated
  GrokEventType, // Already updated
  ChatCompressionInfo,
} from './turn.js';
import { Config } from '../config/config.js';
import { getCoreSystemPrompt } from './prompts.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
// import { getResponseText } from '../utils/generateContentResponseUtilities.js'; // Likely not needed for OpenAI
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { reportError } from '../utils/errorReporting.js';
import { GrokChat } from './grokChat.js';
import { retryWithBackoff } from '../utils/retry.js';
import { getErrorMessage } from '../utils/errors.js';
import { tokenLimit } from './tokenLimits.js';
import {
  ContentGenerator,
  ContentGeneratorConfig,
  createContentGenerator,
} from './contentGenerator.js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { DEFAULT_GROK_FLASH_MODEL } from '../config/models.js'; // Changed
import { AuthType } from './contentGenerator.js';

function isThinkingSupported(model: string) {
  // TODO: Update this if Grok has a similar concept or remove if not applicable
  if (model.startsWith('grok-')) return false; // Placeholder, assume no for now
  return false;
}

export class GrokClient {
  private chat?: GrokChat;
  // private contentGenerator?: ContentGenerator; // This will be replaced by the OpenAI client
  private openAIClient: OpenAI; // Now correctly typed
  private model: string;
  private embeddingModel: string;
  // Default params for OpenAI. Specific methods might override or add to these.
  private generateContentConfig: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming> = {
    temperature: 0,
    // top_p can be used instead of topP for OpenAI
    // max_tokens, etc., can also be set here if desired as general defaults
  };
  private readonly MAX_TURNS = 100; // This might be relevant for history management

  constructor(private config: Config) {
    if (config.getProxy()) {
      setGlobalDispatcher(new ProxyAgent(config.getProxy() as string));
    }

    this.model = config.getModel(); // This should be a Grok model name
    this.embeddingModel = config.getEmbeddingModel(); // This should be a Grok embedding model

    // Initialize OpenAI client
    // Assuming 'openai' package is installed, or a compatible one
    // import OpenAI from 'openai'; // This import would be at the top of the file
    // For now, as a placeholder:
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
  // It's better to let the SDK handle the missing API key error,
  // but we can provide a more specific message if we want.
  // For now, we'll rely on the SDK's error or check explicitly before SDK calls if needed.
  console.warn('XAI_API_KEY environment variable is not set. OpenAI client might not function.');
    }
this.openAIClient = new OpenAI({
  apiKey: apiKey, // The SDK will throw an error if apiKey is null/undefined
      baseURL: "https://api.x.ai/v1",
});
// console.log("GrokClient initialized with actual OpenAI client");

    // Chat initialization might move or change based on OpenAI SDK
    // For now, let's assume GrokChat will be initialized differently or later.
    // this.chat = new GrokChat(this.config, this.openAIClient, this.generateContentConfig); // GrokChat will need to be adapted
  }

  async initialize() { // Simplified initialize, chat might be created on first use
    this.chat = await this.startChat();
  }

  // This method might be deprecated or changed significantly
  // getContentGenerator(): ContentGenerator {
  //   throw new Error('getContentGenerator is deprecated; use openAIClient directly.');
  // }

  async addHistory(message: Content) { // Renamed content to message for clarity with OpenAI types
    this.getChat().addHistory(message);
  }

  getChat(): GrokChat { // This will need to be adapted for OpenAI's chat model
    if (!this.chat) {
      // Potentially initialize chat here if not done in constructor/initialize
      // For now, adhering to existing structure:
      throw new Error('Chat not initialized');
    }
    return this.chat;
  }

  async getHistory(): Promise<Content[]> { // Content[] is now OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    return this.getChat().getHistory();
  }

  async setHistory(history: Content[]): Promise<void> { // Content[] is now OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    this.getChat().setHistory(history);
  }

  async resetChat(): Promise<void> {
    this.chat = await this.startChat(); // Re-initializes chat
  }

  // This method prepares the initial system and user messages for OpenAI
  private async getInitialMessages(): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
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
    const context = `
  This is the Grok CLI. We are setting up the context for our chat.
  Today's date is ${today}.
  My operating system is: ${platform}
  I'm currently working in the directory: ${cwd}
  ${folderStructure}
          `.trim();

    let fullFileContextText = '';
    const toolRegistry = await this.config.getToolRegistry();

    // Add full file context if the flag is set
    if (this.config.getFullContext()) {
      try {
        const readManyFilesTool = toolRegistry.getTool(
          'read_many_files',
        ) as ReadManyFilesTool;
        if (readManyFilesTool) {
          // Read all files in the target directory
          const result = await readManyFilesTool.execute(
            {
              paths: ['**/*'], // Read everything recursively
              useDefaultExcludes: true, // Use default excludes
            },
            AbortSignal.timeout(30000),
          );
          if (result.llmContent) {
            fullFileContextText = `\n--- Full File Context ---\n${result.llmContent}`;
          } else {
            console.warn(
              'Full context requested, but read_many_files returned no content.',
            );
          }
        } else {
          console.warn(
            'Full context requested, but read_many_files tool not found.',
          );
        }
      } catch (error) {
        // Not using reportError here as it's a startup/config phase, not a chat/generation phase error.
        console.error('Error reading full file context:', error);
        fullFileContextText = '\n--- Error reading full file context ---';
      }
    }

    const userMemory = this.config.getUserMemory();
    const systemPrompt = getCoreSystemPrompt(userMemory); // This will be the system message

    const initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: context + fullFileContextText,
      },
      {
        role: 'assistant', // Changed from 'model' to 'assistant' for OpenAI
        content: 'Got it. Thanks for the context!',
      },
    ];
    return initialMessages;
  }

  private async startChat(extraHistory?: Content[]): Promise<GrokChat> { // Corrected return type
    const initialMessages = await this.getInitialMessages();
    const toolRegistry = await this.config.getToolRegistry();
    // Convert Gemini function declarations to OpenAI tools format
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = toolRegistry.getFunctionDeclarations().map(fd => ({
      type: 'function',
      function: {
        name: fd.name,
        description: fd.description,
        parameters: fd.parameters as OpenAI.FunctionParameters, // Cast, ensure schema compatibility
      },
    }));

    const history = initialMessages.concat(extraHistory ?? []);
    // System instruction is now part of initialMessages.
    // Thinking config is not directly applicable to OpenAI, remove.
    // The generateContentConfig here is the default one from the class.
    // Specific GrokChat calls might add more specific params.
    const chatGenerationConfig = { // This will be passed to GrokChat constructor
      ...this.generateContentConfig, // Spreading default temperature etc.
      tools: tools.length > 0 ? tools : undefined,
      // tool_choice: tools.length > 0 ? 'auto' : undefined, // Let OpenAI decide by default
    };

    try {
      return new GrokChat(
        this.config,
        this.openAIClient,
        chatGenerationConfig, // Pass merged config
        history,
      );
    } catch (error) {
      await reportError(
        error,
        'Error initializing Grok chat session.',
        history,
        'startChat',
      );
      throw new Error(`Failed to initialize chat: ${getErrorMessage(error)}`);
    }
  }

  async *sendMessageStream(
    // Request is typically a string for user input. GrokChat will format it.
    request: string | OpenAI.Chat.Completions.ChatCompletionContentPart[],
    signal: AbortSignal,
    turns: number = this.MAX_TURNS,
  ): AsyncGenerator<ServerGrokStreamEvent, Turn> { // Ensure ServerGrokStreamEvent is correctly defined for OpenAI chunks
    if (!turns) {
      return new Turn(this.getChat());
    }

    const compressed = await this.tryCompressChat();
    if (compressed) {
      yield { type: GrokEventType.ChatCompressed, value: compressed };
    }
    const turn = new Turn(this.getChat());
    // turn.run() will internally call chat.sendMessageStream which now uses OpenAI.
    // The events yielded by turn.run() should be adapted to ServerGrokStreamEvent.
    const resultStream = turn.run(request, signal);
    for await (const event of resultStream) {
      yield event; // Assuming Turn.run() is updated to yield ServerGrokStreamEvent
    }

    // checkNextSpeaker logic might need adjustment based on how OpenAI indicates continuation
    if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
      const nextSpeakerCheck = await checkNextSpeaker( // This utility will need to understand OpenAI's responses
        this.getChat(), // GrokChat now uses OpenAI history
        this,
        signal,
      );
      if (nextSpeakerCheck?.next_speaker === 'model') { // 'model' should probably be 'assistant' if mapped
        const nextRequest = 'Please continue.'; // Simple string for OpenAI
        yield* this.sendMessageStream(nextRequest, signal, turns - 1);
      }
    }
    return turn;
  }

  async generateJson(
    // `contents` will be transformed into OpenAI messages format if not already
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    schema: SchemaUnion, // JSON schema for response_format
    abortSignal: AbortSignal,
    model: string = DEFAULT_GROK_FLASH_MODEL, // Ensure this is a Grok/OpenAI compatible model
    // Config will be Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming>
    config: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming> = {},
  ): Promise<Record<string, unknown>> {
    try {
      // System prompt is part of the `messages` array for OpenAI.
      // Ensure the last message in `messages` is the user's request for JSON.
      const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: model,
        messages: messages,
        response_format: { type: "json_object" }, // Using OpenAI's JSON mode
        // Schema might be passed in prompt or if xAI supports it in `response_format`
        ...this.generateContentConfig, // Default temperature etc.
        ...config, // Specific overrides
      };

      // `retryWithBackoff` needs to be adapted if its `apiCall` signature changes
      // For now, assuming it can wrap a promise from `this.openAIClient.chat.completions.create`
      const apiCall = async () => {
        if (abortSignal.aborted) throw new Error('Aborted');
        return this.openAIClient.chat.completions.create(requestParams);
      }

      // TODO: The `onPersistent429` and `authType` parts of retryWithBackoff
      // are tied to the old auth. This needs to be re-evaluated for OpenAI/XAI_API_KEY.
      const result = await retryWithBackoff(apiCall, {
         onPersistent429: async (authType?: string) => // This authType is from old system
           await this.handleFlashFallback(authType), // Fallback logic might need to change
         authType: this.config.getContentGeneratorConfig()?.authType, // This is old auth
      });

      const content = result.choices[0]?.message?.content;
      if (!content) {
        const error = new Error(
          'API returned an empty content for generateJson.',
        );
        await reportError(
          error,
          'Error in generateJson: API returned an empty content.',
          { originalMessages: messages, schema }, // Updated context for error reporting
          'generateJson-empty-content',
        );
        throw error;
      }
      try {
        return JSON.parse(content);
      } catch (parseError) {
        await reportError(
          parseError,
          'Failed to parse JSON response from generateJson.',
          {
            jsonContentFailedToParse: content,
            originalMessages: messages,
            schema
          },
          'generateJson-parse',
        );
        throw new Error(
          `Failed to parse API response as JSON: ${getErrorMessage(parseError)}`,
        );
      }
    } catch (error) {
      if (abortSignal.aborted) {
        throw error;
      }

      // Avoid double reporting for the empty content case handled above
      if (
        error instanceof Error &&
        error.message === 'API returned an empty content for generateJson.'
      ) {
        throw error;
      }

      await reportError(
        error,
        'Error generating JSON content via API.',
        { originalMessages: messages, schema, model, config },
        'generateJson-api',
      );
      throw new Error(
        `Failed to generate JSON content: ${getErrorMessage(error)}`,
      );
    }
  }

  async generateContent(
    // `contents` will be transformed into OpenAI messages format if not already
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    // `generationConfig` will be OpenAI specific params
    generationConfig: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming>,
    abortSignal: AbortSignal,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> { // Return type updated
    const modelToUse = this.model; // Or allow override from generationConfig.model

    // Merge class defaults with method-specific config
    const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: modelToUse,
      messages: messages,
      ...this.generateContentConfig, // Default temperature etc.
      ...generationConfig, // Specific overrides from caller
    };

    try {
      // System prompt is part of `messages` for OpenAI.
      // `retryWithBackoff` needs to be adapted if its `apiCall` signature changes
      const apiCall = async () => {
        if (abortSignal.aborted) throw new Error('Aborted');
        // Ensure no `abortSignal` is passed directly if `retryWithBackoff` handles it or it's not supported by SDK create.
        // OpenAI SDK's `create` method usually takes an `AbortSignal` directly in its options.
        // Let's assume requestParams can include `signal: abortSignal` if needed by OpenAI's SDK directly,
        // or `retryWithBackoff` handles it. For now, direct pass.
        return this.openAIClient.chat.completions.create({ ...requestParams, signal: abortSignal });
      }

      // TODO: Re-evaluate retryWithBackoff for OpenAI context (authType, onPersistent429)
      const result = await retryWithBackoff(apiCall, {
        onPersistent429: async (authType?: string) =>
          await this.handleFlashFallback(authType), // Fallback logic might need to change
        authType: this.config.getContentGeneratorConfig()?.authType, // This is old auth
      });
      return result;
    } catch (error: unknown) {
      if (abortSignal.aborted && !(error instanceof Error && error.name === 'AbortError')) {
         // Don't report if it's a direct AbortError from the signal, as it's an expected cancellation.
      } else if (error instanceof Error && error.name === 'AbortError') {
        // It's an abort, just rethrow.
        throw error;
      } else {
        await reportError(
          error,
          `Error generating content via API with model ${modelToUse}.`,
          {
            requestMessages: messages,
            requestConfig: requestParams,
          },
          'generateContent-api',
        );
      }
      throw new Error( // Ensure a generic error is thrown for other cases
        `Failed to generate content with model ${modelToUse}: ${getErrorMessage(error)}`,
      );
    }
  }

  async generateEmbedding(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }
    // OpenAI expects 'input' to be a string or array of strings.
    // If texts is an array of strings, it's already in the correct format.
    const embeddingParams: OpenAI.EmbeddingCreateParams = {
      model: this.embeddingModel, // Ensure this is a valid Grok/OpenAI embedding model ID
      input: texts,
      // encoding_format: 'float', // Or 'base64', default is float
      // dimensions: number, // Optional: if supported by model and specific dimension needed
    };

    try {
      // TODO: Re-evaluate retryWithBackoff for OpenAI context (authType, onPersistent429)
      // For embeddings, retry might be simpler or handled differently.
      // For now, direct call. Add retry later if needed.
      const embeddingResponse = await this.openAIClient.embeddings.create(embeddingParams);

      if (!embeddingResponse.data || embeddingResponse.data.length === 0) {
        throw new Error('No embeddings found in API response.');
      }

      if (embeddingResponse.data.length !== texts.length) {
        // This case should ideally not happen if the API behaves correctly (one embedding per input string)
        // but good to have a check.
        await reportError(
          new Error('Mismatched embedding count'),
          'API returned mismatched number of embeddings.',
          { requestTexts: texts, responseEmbeddingCount: embeddingResponse.data.length },
          'generateEmbedding-mismatch',
        );
        throw new Error(
          `API returned a mismatched number of embeddings. Expected ${texts.length}, got ${embeddingResponse.data.length}.`,
        );
      }

      return embeddingResponse.data.map((embeddingObject, index) => {
        if (!embeddingObject.embedding || embeddingObject.embedding.length === 0) {
          // This also should ideally not happen with a valid API response.
          reportError(
            new Error('Empty embedding vector'),
            `API returned an empty embedding vector for input text at index ${index}.`,
            { inputText: texts[index] },
            'generateEmbedding-empty-vector',
          ).catch(err => console.error("Failed to report error:", err)); // Fire-and-forget reporting
          throw new Error(
            `API returned an empty embedding for input text at index ${index}: "${texts[index]}"`,
          );
        }
        return embeddingObject.embedding;
      });
    } catch (error) {
      await reportError(
        error,
        'Error generating embeddings via API.',
        { requestTexts: texts, embeddingModel: this.embeddingModel },
        'generateEmbedding-api',
      );
      throw new Error(
        `Failed to generate embeddings: ${getErrorMessage(error)}`,
      );
    }
  }

  async tryCompressChat(
    force: boolean = false,
  ): Promise<ChatCompressionInfo | null> {
    const history = this.getChat().getHistory(true); // Get curated history (OpenAI.Chat.Completions.ChatCompletionMessageParam[])

    // Regardless of `force`, don't do anything if the history is empty.
    // OpenAI history usually includes a system message, so length > 1 or 2 might be a better check.
    if (history.length <= 1) { // Assuming at least a system message might exist
      return null;
    }

    // TODO: Implement token counting with tiktoken if available
    // For now, we'll simulate or bypass this check.
    let originalTokenCount: number | undefined = undefined;
    try {
      // Placeholder: Simulate token counting or use a library like 'tiktoken'
      // const { getEncoding } = await import('tiktoken'); // Dynamically import if preferred
      // const encoding = getEncoding("cl100k_base"); // Or appropriate encoding for the model
      // originalTokenCount = history.reduce((acc, msg) => acc + encoding.encode(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)).length, 0);
      // encoding.free();
      console.warn(
        `Token counting for tryCompressChat is not fully implemented without 'tiktoken'. Using estimated length.`,
      );
      originalTokenCount = history.reduce((acc, msg) => acc + (typeof msg.content === 'string' ? msg.content.length : 0),0); // Very rough estimate
    } catch (e) {
        console.warn("Failed to count tokens for compression check:", e);
    }


    // If not forced, check if we should compress based on context size.
    if (!force && originalTokenCount !== undefined) {
      const limit = tokenLimit(this.model); // tokenLimit might need adjustment for OpenAI models
      if (!limit) {
        console.warn(
          `No token limit defined for model ${this.model}. Skipping compression check.`,
        );
        // return null; // Allow compression if forced, even without limit known
      } else if (originalTokenCount < 0.95 * limit) {
        return null;
      }
    } else if (!force) {
      // Not forced and originalTokenCount is undefined
      console.warn("Cannot determine if compression is needed without token count and not being forced.");
      return null;
    }

    const summarizationPrompt = 'Summarize our conversation up to this point. The summary should be a concise yet comprehensive overview of all key topics, questions, answers, and important details discussed. This summary will replace the current chat history to conserve tokens, so it must capture everything essential to understand the context and continue our conversation effectively as if no information was lost.';

    // sendMessage in GrokChat will need to be adapted for OpenAI
    // It should return an OpenAI.Chat.Completions.ChatCompletion object
    const response = await this.getChat().sendMessage(summarizationPrompt);
    const summaryText = response.choices[0]?.message?.content;

    if (!summaryText) {
      console.warn("Compression summarization failed to return text.");
      return null;
    }

    // Construct new history with the summary
    // Preserve the original system message if any, then user prompt for summary, then model's summary.
    const systemMessage = history.find(h => h.role === 'system');
    const newHistoryMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (systemMessage) {
      newHistoryMessages.push(systemMessage);
    }
    newHistoryMessages.push({ role: 'user', content: summarizationPrompt });
    newHistoryMessages.push({ role: 'assistant', content: summaryText });

    this.chat = await this.startChat(newHistoryMessages); // startChat now takes array of ChatCompletionMessageParam

    let newTokenCount: number | undefined = undefined;
    try {
      // Placeholder for new token count
      // const { getEncoding } = await import('tiktoken');
      // const encoding = getEncoding("cl100k_base");
      // newTokenCount = newHistoryMessages.reduce((acc, msg) => acc + encoding.encode(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)).length, 0);
      // encoding.free();
      console.warn(
        `Token counting for new history in tryCompressChat is not fully implemented without 'tiktoken'. Using estimated length.`,
      );
      newTokenCount = newHistoryMessages.reduce((acc, msg) => acc + (typeof msg.content === 'string' ? msg.content.length : 0),0); // Rough estimate
    } catch (e) {
        console.warn("Failed to count tokens for new history:", e);
    }

    return originalTokenCount !== undefined && newTokenCount !== undefined
      ? {
          originalTokenCount,
          newTokenCount,
        }
      : null;
  }

  /**
   * Handles fallback to Flash model when persistent 429 errors occur for OAuth users.
   * Uses a fallback handler if provided by the config, otherwise returns null.
   */
  private async handleFlashFallback(authType?: string): Promise<string | null> {
    // Only handle fallback for OAuth users
    if (authType !== AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
      return null;
    }

    const currentModel = this.model;
    const fallbackModel = DEFAULT_GROK_FLASH_MODEL;

    // Don't fallback if already using Flash model
    if (currentModel === fallbackModel) {
      return null;
    }

    // Check if config has a fallback handler (set by CLI package)
    const fallbackHandler = this.config.flashFallbackHandler;
    if (typeof fallbackHandler === 'function') {
      try {
        const accepted = await fallbackHandler(currentModel, fallbackModel);
        if (accepted) {
          this.config.setModel(fallbackModel);
          this.model = fallbackModel;
          return fallbackModel;
        }
      } catch (error) {
        console.warn('Flash fallback handler failed:', error);
      }
    }

    return null;
  }
}
