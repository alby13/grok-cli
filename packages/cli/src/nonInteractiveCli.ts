/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * This file has been refactored to run a non-interactive session using the XaiClient.
 * It handles a single, continuous task from start to finish via the command line.
 */

import {
  Config,
  ToolRegistry,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  XaiClient,
  executeSingleToolCall,
} from '@google/gemini-cli-core'; // This will resolve to your updated core package
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { parseAndFormatApiError } from './ui/utils/errorParsing.js';

/**
 * Runs a complete task non-interactively, from initial prompt to completion,
 * including handling any necessary tool calls.
 * @param config The application configuration.
 * @param initialPrompt The initial user input that starts the task.
 */
export async function runNonInteractive(
  config: Config,
  initialPrompt: string,
): Promise<void> {
  // Handle EPIPE errors when the output is piped to a command that closes early (e.g., `head`).
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      process.exit(0);
    }
  });

  const client = new XaiClient(config);
  const toolRegistry: ToolRegistry = await config.getToolRegistry();
  const abortController = new AbortController();

  let nextPrompt = initialPrompt;

  try {
    // A continuous loop that represents the conversation.
    // It only breaks when the model has no more text and no more tools to call.
    while (true) {
      const stream = client.sendMessageStream(
        nextPrompt,
        abortController.signal,
      );

      // 1. Process the stream from the model (text output).
      for await (const event of stream) {
        if (event.type === 'contentDelta') {
          process.stdout.write(event.value);
        }
        // Could add more detailed logging for other event types here if needed.
      }
      
      const streamResult = await stream.next();
      const finalTurn = streamResult.value;

      // 2. Check for tool calls.
      if (finalTurn && finalTurn.pendingToolCalls.length > 0) {
        process.stdout.write('\n'); // Add a newline after the model's text.
        console.log(`[Executing ${finalTurn.pendingToolCalls.length} tool(s)...]`);

        const toolMessages: ChatCompletionMessageParam[] = [];

        // 3. Execute each tool call sequentially.
        for (const toolCall of finalTurn.pendingToolCalls) {
          const toolMessage = await executeSingleToolCall(
            config,
            toolCall,
            toolRegistry,
            abortController.signal,
          );
          toolMessages.push(toolMessage);
        }

        // 4. Add the results to history and prepare for the next loop iteration.
        for (const msg of toolMessages) {
          client.addHistory(msg);
        }
        nextPrompt = 'Tool execution finished. Please analyze the results and continue with the original task.';
      } else {
        // 5. If there are no tool calls, the task is complete.
        process.stdout.write('\n'); // Ensure a final newline.
        break; // Exit the while loop.
      }
    }
  } catch (error) {
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig()?.authType, // This might need updating depending on config refactor
      ),
    );
    process.exit(1);
  } finally {
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry();
    }
  }
}
