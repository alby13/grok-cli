/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, Part } from '@google/genai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export function mapPartsToOpenAIChatMessages(
  contents: Content[],
  lastToolCallIds?: Array<{ name: string; id: string }>,
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];
  for (const content of contents) {
    // Assuming 'tool' role is used for function responses in Gemini Content array
    if (content.role === 'tool' || content.parts.some(part => 'functionResponse' in part)) {
      for (const part of content.parts) {
        if ('functionResponse' in part && part.functionResponse) {
          const toolCallId = lastToolCallIds?.find(
            (tc) => tc.name === part.functionResponse!.name,
          )?.id;
          if (!toolCallId) {
            console.warn(
              `Could not find tool_call_id for function response: ${
                part.functionResponse.name
              }. This tool call might be ignored or cause an error.`,
            );
          }
          messages.push({
            role: 'tool',
            tool_call_id: toolCallId || `MISSING_ID_FOR_${part.functionResponse.name}`, // Provide a fallback or log error
            name: part.functionResponse.name,
            content: JSON.stringify(part.functionResponse.response),
          });
        }
      }
    } else {
      const textContent = content.parts
        .map((part: Part) => (part as { text?: string }).text || '')
        .join('');
      messages.push({
        role: content.role === 'model' ? 'assistant' : content.role,
        content: textContent,
      });
    }
  }
  return messages;
}

export function mapOpenAIChatMessagesToParts(
  messages: Array<{
    role?: string | null;
    content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }> | null;
    function_call?: { name?: string | null; arguments?: string | null } | null; // For older OpenAI models
  }>,
): Part[] {
  const parts: Part[] = [];
  for (const msg of messages) {
    if (msg.content) {
      parts.push({ text: msg.content });
    }
    // Handle tool_calls (newer OpenAI format)
    if (msg.tool_calls) {
      for (const toolCall of msg.tool_calls) {
        if (toolCall.type === 'function') {
          try {
            parts.push({
              functionCall: {
                name: toolCall.function.name,
                args: JSON.parse(toolCall.function.arguments),
              },
            });
          } catch (e) {
            console.warn(
              `Failed to parse tool_call arguments as JSON: ${toolCall.function.arguments}`,
              e,
            );
            // Add as text part if parsing fails? Or a special error part?
            // For now, skipping malformed tool call.
          }
        }
      }
    }
    // Handle function_call (older OpenAI format)
    else if (msg.function_call) {
      if (msg.function_call.name && msg.function_call.arguments) {
        try {
          parts.push({
            functionCall: {
              name: msg.function_call.name,
              args: JSON.parse(msg.function_call.arguments),
            },
          });
        } catch (e) {
          console.warn(
            `Failed to parse function_call arguments as JSON: ${msg.function_call.arguments}`,
            e,
          );
        }
      }
    }
  }
  return parts;
}
