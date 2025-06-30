/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import OpenAI from 'openai';
import { logToolCall, ToolRegistry, ToolResult } from '../index.js';
import { Config } from '../config/config.js';

/**
 * Executes a single tool call non-interactively and returns a message
 * formatted for the OpenAI/xAI API.
 *
 * @param config The application configuration for logging.
 * @param toolCall The tool call object received from the model.
 * @param toolRegistry The registry to find the tool in.
 * @param abortSignal An optional signal to cancel the execution.
 * @returns A promise that resolves to a `ChatCompletionToolMessageParam`
 *          ready to be sent back to the model.
 */
export async function executeSingleToolCall(
  config: Config,
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  toolRegistry: ToolRegistry,
  abortSignal?: AbortSignal,
): Promise<OpenAI.Chat.Completions.ChatCompletionToolMessageParam> {
  const toolName = toolCall.function.name;
  const toolCallId = toolCall.id;
  const tool = toolRegistry.getTool(toolName);
  const startTime = Date.now();

  let args: Record<string, unknown>;
  try {
    // Critical step: Parse the arguments string from the API.
    args = JSON.parse(toolCall.function.arguments);
  } catch (e) {
    const error = new Error(`Failed to parse tool arguments as JSON for tool "${toolName}". Invalid JSON: ${toolCall.function.arguments}`);
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolName,
      function_args: toolCall.function.arguments, // Log the raw string
      duration_ms: Date.now() - startTime,
      success: false,
      error: error.message,
    });
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: `Error: ${error.message}`,
    };
  }

  if (!tool) {
    const error = new Error(`Tool "${toolName}" not found in registry.`);
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolName,
      function_args: args,
      duration_ms: Date.now() - startTime,
      success: false,
      error: error.message,
    });
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: `Error: ${error.message}`,
    };
  }

  try {
    const effectiveAbortSignal = abortSignal ?? new AbortController().signal;
    const toolResult: ToolResult = await tool.execute(
      args,
      effectiveAbortSignal,
    );

    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolName,
      function_args: args,
      duration_ms: durationMs,
      success: true,
    });

    // The result from a tool call is expected to be a string.
    const resultContent = typeof toolResult.llmContent === 'string'
        ? toolResult.llmContent
        : JSON.stringify(toolResult.llmContent);

    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: resultContent,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolName,
      function_args: args,
      duration_ms: durationMs,
      success: false,
      error: error.message,
    });
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: `Error executing tool: ${error.message}`,
    };
  }
}
