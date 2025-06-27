/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
} from '@google/genai';
import OpenAI from 'openai';
import { ContentGenerator } from './contentGenerator.js';
import {
  mapPartsToOpenAIChatMessages,
  mapOpenAIChatMessagesToParts,
} from '../utils/mappers.js'; // Assuming mappers.ts will be created

export class GrokApiClient implements ContentGenerator {
  private openai: OpenAI;
  private defaultModel: string;
  private lastToolCallIds: Array<{ name: string; id: string }> = [];

  constructor(apiKey: string, defaultModel: string = 'grok-3-latest') {
    this.openai = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.x.ai/v1',
    });
    this.defaultModel = defaultModel;
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const messages = mapPartsToOpenAIChatMessages(
      request.contents as Content[],
      this.lastToolCallIds,
    ); // Cast needed if contents can be string

    const modelToUse = request.model || this.defaultModel;
    const generationParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
      {
        model: modelToUse,
        messages: messages,
        temperature: request.generationConfig?.temperature ?? undefined,
        top_p: request.generationConfig?.topP ?? undefined,
        max_tokens: request.generationConfig?.maxOutputTokens ?? undefined,
        n: request.generationConfig?.candidateCount ?? undefined,
        stop: request.generationConfig?.stopSequences ?? undefined,
        stream: false,
      };

    // Remove undefined params to avoid sending them to OpenAI
    Object.keys(generationParams).forEach((key) => {
      if (
        generationParams[key as keyof typeof generationParams] === undefined
      ) {
        delete generationParams[key as keyof typeof generationParams];
      }
    });

    const completion =
      await this.openai.chat.completions.create(generationParams);

    this.lastToolCallIds = []; // Clear previous IDs
    completion.choices.forEach((choice) => {
      if (choice.message.tool_calls) {
        choice.message.tool_calls.forEach((toolCall) => {
          if (toolCall.type === 'function') {
            this.lastToolCallIds.push({
              name: toolCall.function.name,
              id: toolCall.id,
            });
          }
        });
      }
    });

    const choices = completion.choices.map((choice) => {
      return {
        content: {
          parts: mapOpenAIChatMessagesToParts([choice.message]),
          role: choice.message.role || 'model', // Default to 'model' if role is missing
        },
        index: choice.index,
        finishReason: choice.message.refusal
          ? 'REFUSAL' // Map Grok's refusal to a specific finish reason
          : (choice.finish_reason?.toUpperCase() as any), // Map from OpenAI finish_reason
        // safetyRatings are not directly provided by Grok API in the same way as Gemini.
        // Leaving safetyRatings empty or undefined.
        safetyRatings: [],
      };
    });

    return {
      // promptFeedback is not directly provided by Grok API.
      candidates: choices,
      usageMetadata: {
        promptTokenCount: completion.usage?.prompt_tokens,
        candidatesTokenCount: completion.usage?.completion_tokens,
        totalTokenCount: completion.usage?.total_tokens,
      },
    };
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const messages = mapPartsToOpenAIChatMessages(
      request.contents as Content[],
      this.lastToolCallIds,
    );

    const modelToUse = request.model || this.defaultModel;
    const generationParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming =
      {
        model: modelToUse,
        messages: messages,
        temperature: request.generationConfig?.temperature ?? undefined,
        top_p: request.generationConfig?.topP ?? undefined,
        max_tokens: request.generationConfig?.maxOutputTokens ?? undefined,
        n: request.generationConfig?.candidateCount ?? undefined,
        stop: request.generationConfig?.stopSequences ?? undefined,
        stream: true,
      };

    // Remove undefined params to avoid sending them to OpenAI
    Object.keys(generationParams).forEach((key) => {
      if (
        generationParams[key as keyof typeof generationParams] === undefined
      ) {
        delete generationParams[key as keyof typeof generationParams];
      }
    });

    const stream =
      await this.openai.chat.completions.create(generationParams);

    // Clear tool call IDs at the beginning of a new stream.
    this.lastToolCallIds = [];
    // Capture `this` for use in the generator function.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    async function* generate(): AsyncGenerator<GenerateContentResponse> {
      for await (const chunk of stream) {
        // Accumulate tool_call_ids from chunks
        // tool_calls usually appear in full on one of the first chunks from the assistant
        chunk.choices.forEach((choice) => {
          if (choice.delta?.tool_calls) {
            choice.delta.tool_calls.forEach((toolCall) => {
              if (
                toolCall && // toolCall itself might be null/undefined in partial stream
                toolCall.id &&
                toolCall.function?.name &&
                !self.lastToolCallIds.find((tc) => tc.id === toolCall.id)
              ) {
                self.lastToolCallIds.push({
                  name: toolCall.function.name,
                  id: toolCall.id,
                });
              }
            });
          }
        });

        const choices = chunk.choices.map((choice) => {
          return {
            content: {
              parts: mapOpenAIChatMessagesToParts([choice.delta]),
              role: choice.delta.role || 'model',
            },
            index: choice.index,
            finishReason: choice.delta.refusal // Assuming refusal can appear in delta
              ? 'REFUSAL'
              : (choice.finish_reason?.toUpperCase() as any),
            // safetyRatings are not directly provided by Grok API in the same way as Gemini.
            // Leaving safetyRatings empty or undefined for streamed chunks.
            safetyRatings: [],
          };
        });
        yield {
          candidates: choices,
          // usageMetadata is typically not available per stream chunk.
        };
      }
    }
    return generate();
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // The OpenAI SDK doesn't have a direct countTokens method.
    // This might need to be implemented by making a request to a specific Grok endpoint
    // or by using a library that can count tokens for Grok models locally.
    // For now, returning a placeholder.
    // TODO: Revisit Grok token counting if a dedicated API or tokenizer info becomes available.
    console.warn(
      'GrokApiClient.countTokens currently uses a rough estimation (1 token ~ 4 chars) as a direct Grok token counting method is not available. This may be inaccurate.',
    );
    const textContent = (request.contents as Content[])
      .flatMap((content) => content.parts)
      .map((part: Part) => (part as { text?: string }).text || '')
      .join('');
    // Rough estimation: 1 token ~ 4 chars in English
    const estimatedTokens = Math.ceil(textContent.length / 4);
    return { totalTokens: estimatedTokens };
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    // Assuming Grok API uses a similar embedding structure to OpenAI
    // This will need to be adjusted based on actual Grok API capabilities.
    if (!Array.isArray(request.contents)) {
      throw new Error(
        'EmbedContentParameters.contents must be an array for GrokApiClient.',
      );
    }
    const texts = request.contents.map((content) => {
      if (typeof content === 'string') return content;
      // Assuming content is Part[] or similar structure that can be stringified
      return content.parts
        .map((part: Part) => (part as { text?: string }).text || '')
        .join('');
    });

    // The OpenAI SDK's embedding creation might differ.
    // This is a placeholder and needs verification with Grok's actual embedding API.
    // Grok might not support batch embeddings or might have different parameter names.
    // For now, let's assume it's not directly supported or requires a different approach.
    // TODO: Implement embedContent if Grok provides an embedding API and model.
    console.warn(
      'GrokApiClient.embedContent is not implemented as Grok embedding capabilities are currently unknown. Please refer to xAI documentation for embedding support.',
    );
    throw new Error(
      'GrokApiClient.embedContent is not implemented due to unknown Grok embedding capabilities.',
    );
    // Example if it were similar to OpenAI:
    // const response = await this.openai.embeddings.create({
    //   model: request.model || 'text-embedding-ada-002', // Or a Grok specific embedding model
    //   input: texts,
    // });
    // return {
    //   embeddings: response.data.map(emb => ({ values: emb.embedding }))
    // };
  }
}
