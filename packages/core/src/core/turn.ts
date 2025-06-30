/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import OpenAI from 'openai';
import { XaiClient } from './XaiClient.js';
import { reportError } from '../utils/errorReporting.js';
import { getErrorMessage } from '../utils/errors.js';

// Define event types for the OpenAI-compatible stream.
export enum EventType {
  ContentDelta = 'contentDelta',
  ToolCallStart = 'toolCallStart',
  ToolCallDelta = 'toolCallDelta',
  ToolCallEnd = 'toolCallEnd',
  Error = 'error',
  ChatCompressed = 'chatCompressed',
  // Note: Usage metadata is not available in the stream, so it's omitted.
}

// Define the structure of events yielded by the Turn's run method.
export interface StructuredError {
  message: string;
  status?: number; // Keep for potential HTTP errors
}

export type ContentDeltaEvent = {
  type: EventType.ContentDelta;
  value: string;
};

export type ToolCallStartEvent = {
  type: EventType.ToolCallStart;
  value: { name: string };
};

export type ToolCallDeltaEvent = {
  type: EventType.ToolCallDelta;
  value: { name: string; argsChunk: string };
};

export type ToolCallEndEvent = {
  type: EventType.ToolCallEnd;
  value: { name: string };
};

export type ErrorEvent = {
  type: EventType.Error;
  value: { error: StructuredError };
};

export interface ChatCompressionInfo {
  originalTokenCount: number;
  newTokenCount: number;
}

export type ChatCompressedEvent = {
  type: EventType.ChatCompressed;
  value: ChatCompressionInfo | null;
};

// The union type for all possible stream events.
export type ServerStreamEvent =
  | ContentDeltaEvent
  | ToolCallStartEvent
  | ToolCallDeltaEvent
  | ToolCallEndEvent
  | ErrorEvent
  | ChatCompressedEvent;

/**
 * A Turn manages a single agentic loop turn (a single API call and its response).
 * It processes the stream from an OpenAI-compatible API and yields structured events.
 */
export class Turn {
  public pendingToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
  private finalAssistantMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam | null = null;

  constructor(private readonly client: XaiClient) {}

  /**
   * Retrieves the fully assembled assistant message after the stream is complete.
   * This is used by the client to update its history.
   */
  getFinalAssistantMessage(): OpenAI.Chat.Completions.ChatCompletionMessageParam | null {
    return this.finalAssistantMessage;
  }

  /**
   * Runs the agentic turn.
   * @param history The full conversation history to be sent to the API.
   * @param signal An AbortSignal to cancel the request.
   * @yields {ServerStreamEvent} Events representing the API response.
   */
  async *run(
    history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    signal: AbortSignal,
  ): AsyncGenerator<ServerStreamEvent> {
    try {
      const toolRegistry = await this.client.getConfig().getToolRegistry();
      // Assumes a method to get tools in OpenAI format exists.
      const tools = toolRegistry.getOpenAIToolDeclarations();

      const stream = await this.client.createChatCompletionStream(
        history,
        tools,
        signal,
      );

      let fullResponseText = '';
      // Buffer for assembling tool calls as they stream in.
      const toolCallBuffers: {
        [index: number]: {
          id: string;
          function: { name: string; arguments: string };
        };
      } = {};

      for await (const chunk of stream) {
        if (signal.aborted) {
          // The stream will be cancelled by the SDK, but we stop processing.
          return;
        }

        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Handle text content chunks
        if (delta.content) {
          fullResponseText += delta.content;
          yield { type: EventType.ContentDelta, value: delta.content };
        }

        // Handle tool call chunks
        if (delta.tool_calls) {
          for (const toolCallChunk of delta.tool_calls) {
            const index = toolCallChunk.index;

            // A new tool call is starting.
            if (toolCallChunk.id) {
              toolCallBuffers[index] = {
                id: toolCallChunk.id,
                function: { name: '', arguments: '' },
              };
            }

            const buffer = toolCallBuffers[index];
            if (!buffer) continue;

            if (toolCallChunk.function?.name) {
              buffer.function.name += toolCallChunk.function.name;
              // Yield a start event only when we have the name.
              if (toolCallChunk.function.name.length > 0) {
                 yield { type: EventType.ToolCallStart, value: { name: buffer.function.name }};
              }
            }

            if (toolCallChunk.function?.arguments) {
              buffer.function.arguments += toolCallChunk.function.arguments;
              yield { type: EventType.ToolCallDelta, value: { name: buffer.function.name, argsChunk: toolCallChunk.function.arguments }};
            }
          }
        }
      }

      // Finalize and store the completed tool calls
      const completedToolCalls = Object.values(toolCallBuffers).map(
        (buffer) =>
          ({
            id: buffer.id,
            type: 'function',
            function: {
              name: buffer.function.name,
              arguments: buffer.function.arguments,
            },
          } as OpenAI.Chat.Completions.ChatCompletionMessageToolCall),
      );

      if (completedToolCalls.length > 0) {
        this.pendingToolCalls = completedToolCalls;
        for (const toolCall of completedToolCalls) {
            yield { type: EventType.ToolCallEnd, value: { name: toolCall.function.name }};
        }
      }

      // Assemble the final message for the history log.
      this.finalAssistantMessage = {
        role: 'assistant',
        content: fullResponseText || null, // content is null if only tool calls are made
        tool_calls: this.pendingToolCalls.length > 0 ? this.pendingToolCalls : undefined,
      };

    } catch (e) {
      if (signal.aborted) return; // Fail gracefully on user cancellation.

      const error = e as Error;
      await reportError(
        error,
        'Error when talking to xAI API',
        history,
        'Turn.run',
      );

      const structuredError: StructuredError = {
        message: getErrorMessage(error),
      };

      yield { type: EventType.Error, value: { error: structuredError } };
      return;
    }
  }
}
