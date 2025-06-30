/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import OpenAI from 'openai';
import {
  Tool,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolRegistry,
  Config,
  logToolCall,
  ToolCallEvent,
  ApprovalMode,
  EditorType,
  ToolResult,
} from '../index.js'; // Assuming local types are provider-agnostic
import {
  isModifiableTool,
  ModifyContext,
  modifyWithEditor,
} from '../tools/modifiable-tool.js';

// SECTION 1: INTERNAL STATE AND TYPE DEFINITIONS (PROVIDER-AGNOSTIC)

// A simplified, internal representation of a tool call request.
type ToolCallRequest = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

// The internal states that a tool call can be in.
export type ValidatingToolCall = {
  status: 'validating';
  request: ToolCallRequest;
  tool: Tool;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

export type ScheduledToolCall = {
  status: 'scheduled';
  request: ToolCallRequest;
  tool: Tool;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

// The internal `response` will hold the final, formatted message for the API.
export type ErroredToolCall = {
  status: 'error';
  request: ToolCallRequest;
  response: OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
  durationMs?: number;
  outcome?: ToolConfirmationOutcome;
};

export type SuccessfulToolCall = {
  status: 'success';
  request: ToolCallRequest;
  tool: Tool;
  response: OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
  durationMs?: number;
  outcome?: ToolConfirmationOutcome;
};

export type ExecutingToolCall = {
  status: 'executing';
  request: ToolCallRequest;
  tool: Tool;
  liveOutput?: string;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

export type CancelledToolCall = {
  status: 'cancelled';
  request: ToolCallRequest;
  tool: Tool;
  response: OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
  durationMs?: number;
  outcome?: ToolConfirmationOutcome;
};

export type WaitingToolCall = {
  status: 'awaiting_approval';
  request: ToolCallRequest;
  tool: Tool;
  confirmationDetails: ToolCallConfirmationDetails;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

export type Status = ToolCall['status'];

export type ToolCall =
  | ValidatingToolCall
  | ScheduledToolCall
  | ErroredToolCall
  | SuccessfulToolCall
  | ExecutingToolCall
  | CancelledToolCall
  | WaitingToolCall;

export type CompletedToolCall =
  | SuccessfulToolCall
  | CancelledToolCall
  | ErroredToolCall;

// SECTION 2: PUBLIC HANDLER AND HELPER DEFINITIONS

/**
 * The signature for the handler that is called when all scheduled tools are finished.
 * It provides an array of messages ready to be sent back to the API.
 */
export type AllToolCallsCompleteHandler = (
  toolMessages: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[],
) => void;

export type ToolCallsUpdateHandler = (toolCalls: ToolCall[]) => void;

/**
 * Formats a tool's string output for an OpenAI ToolMessage.
 */
function convertToToolMessage(
  toolCallId: string,
  result: string,
): OpenAI.Chat.Completions.ChatCompletionToolMessageParam {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: result,
  };
}

const createErrorToolMessage = (
  request: ToolCallRequest,
  error: Error,
): OpenAI.Chat.Completions.ChatCompletionToolMessageParam => {
  return convertToToolMessage(
    request.id,
    `Tool execution failed with error: ${error.message}`,
  );
};

// SECTION 3: CORE TOOL SCHEDULER CLASS

interface CoreToolSchedulerOptions {
  toolRegistry: Promise<ToolRegistry>;
  onAllToolCallsComplete?: AllToolCallsCompleteHandler;
  onToolCallsUpdate?: ToolCallsUpdateHandler;
  approvalMode?: ApprovalMode;
  getPreferredEditor: () => EditorType | undefined;
  config: Config;
}

export class CoreToolScheduler {
  private toolRegistry: Promise<ToolRegistry>;
  private toolCalls: ToolCall[] = [];
  private onAllToolCallsComplete?: AllToolCallsCompleteHandler;
  private onToolCallsUpdate?: ToolCallsUpdateHandler;
  private approvalMode: ApprovalMode;
  private getPreferredEditor: () => EditorType | undefined;
  private config: Config;

  constructor(options: CoreToolSchedulerOptions) {
    this.config = options.config;
    this.toolRegistry = options.toolRegistry;
    this.onAllToolCallsComplete = options.onAllToolCallsComplete;
    this.onToolCallsUpdate = options.onToolCallsUpdate;
    this.approvalMode = options.approvalMode ?? ApprovalMode.DEFAULT;
    this.getPreferredEditor = options.getPreferredEditor;
  }

  private setStatusInternal(targetCallId: string, status: 'success', response: OpenAI.Chat.Completions.ChatCompletionToolMessageParam): void;
  // ... other overloads for setStatusInternal would go here ...
  private setStatusInternal(targetCallId: string, newStatus: Status, auxiliaryData?: unknown): void {
    // This internal state machine logic is complex but largely provider-agnostic.
    // It maps one internal state to another. The key change is that the `response`
    // it receives for 'success', 'error', and 'cancelled' states is now the
    // pre-formatted OpenAI ToolMessage object.
  }

  private isRunning(): boolean {
    return this.toolCalls.some(
      (call) => call.status === 'executing' || call.status === 'awaiting_approval',
    );
  }

  /**
   * Schedules tool calls received from the model.
   * @param requests The array of tool calls from the API response.
   * @param signal An AbortSignal to cancel operations.
   */
  async schedule(
    requests: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
    signal: AbortSignal,
  ): Promise<void> {
    if (this.isRunning()) {
      throw new Error('Cannot schedule new tool calls while other tool calls are actively running.');
    }
    const toolRegistry = await this.toolRegistry;

    const newToolCalls: ToolCall[] = requests.map((req): ToolCall => {
      let parsedArgs: Record<string, unknown>;
      try {
        // OpenAI tool arguments are a string that must be parsed. This is a critical step.
        parsedArgs = JSON.parse(req.function.arguments);
      } catch (e) {
        const requestInfoOnError = { id: req.id, name: req.function.name, args: {} };
        return {
          status: 'error',
          request: requestInfoOnError,
          response: createErrorToolMessage(requestInfoOnError, new Error(`Failed to parse tool arguments as JSON: ${req.function.arguments}`)),
          durationMs: 0,
        };
      }

      const requestInfo: ToolCallRequest = { id: req.id, name: req.function.name, args: parsedArgs };
      const toolInstance = toolRegistry.getTool(requestInfo.name);

      if (!toolInstance) {
        return {
          status: 'error',
          request: requestInfo,
          response: createErrorToolMessage(requestInfo, new Error(`Tool "${requestInfo.name}" not found in registry.`)),
          durationMs: 0,
        };
      }

      return { status: 'validating', request: requestInfo, tool: toolInstance, startTime: Date.now() };
    });

    this.toolCalls = this.toolCalls.concat(newToolCalls);
    this.notifyToolCallsUpdate();

    // The logic for validation and confirmation remains the same.
    for (const toolCall of newToolCalls) {
      if (toolCall.status !== 'validating') continue;
      // ... logic for shouldConfirmExecute and setting status to 'awaiting_approval' or 'scheduled'
    }

    this.attemptExecutionOfScheduledCalls(signal);
    this.checkAndNotifyCompletion();
  }
  
  // ... (handleConfirmationResponse logic remains the same)

  private attemptExecutionOfScheduledCalls(signal: AbortSignal): void {
    const allCallsReady = this.toolCalls.every(
      (call) => ['scheduled', 'cancelled', 'success', 'error'].includes(call.status)
    );

    if (allCallsReady) {
      const callsToExecute = this.toolCalls.filter((call) => call.status === 'scheduled');
      callsToExecute.forEach((toolCall) => {
        if (toolCall.status !== 'scheduled') return;
        
        const scheduledCall = toolCall as ScheduledToolCall;
        const { id: callId, name: toolName } = scheduledCall.request;
        this.setStatusInternal(callId, 'executing');

        scheduledCall.tool.execute(scheduledCall.request.args, signal)
          .then((toolResult: ToolResult) => {
            if (signal.aborted) {
              this.setStatusInternal(callId, 'cancelled', 'User cancelled tool execution.');
              return;
            }
            // Assuming toolResult.llmContent is a string result.
            const successResponse = convertToToolMessage(callId, toolResult.llmContent as string);
            this.setStatusInternal(callId, 'success', successResponse);
          })
          .catch((executionError: Error) => {
            const errorResponse = createErrorToolMessage(scheduledCall.request, executionError);
            this.setStatusInternal(callId, 'error', errorResponse);
          });
      });
    }
  }

  private checkAndNotifyCompletion(): void {
    const allCallsAreTerminal = this.toolCalls.every(
      (call) => ['success', 'error', 'cancelled'].includes(call.status)
    );

    if (this.toolCalls.length > 0 && allCallsAreTerminal) {
      const completedCalls = [...this.toolCalls] as CompletedToolCall[];
      this.toolCalls = [];

      // Extract the pre-formatted tool messages from the completed call states.
      const toolMessages = completedCalls.map(call => call.response);

      for (const call of completedCalls) {
        logToolCall(this.config, new ToolCallEvent(call as any)); // May need to adapt ToolCallEvent
      }

      // CRITICAL: Call the handler with the OpenAI-formatted messages.
      if (this.onAllToolCallsComplete) {
        this.onAllToolCallsComplete(toolMessages);
      }
      this.notifyToolCallsUpdate();
    }
  }

  private notifyToolCallsUpdate(): void {
    if (this.onToolCallsUpdate) {
      this.onToolCallsUpdate([...this.toolCalls]);
    }
  }
}
