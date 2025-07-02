/**
 * @license
 * Copyright 2025 alby13
 * SPDX-License-Identifier: Apache-2.0
 */

// Defines valid event metadata keys for Clearcut logging.
export enum EventMetadataKey {
  GROK_CLI_KEY_UNKNOWN = 0, // Renamed

  // ==========================================================================
  // Start Session Event Keys
  // ===========================================================================

  // Logs the model id used in the session.
  GROK_CLI_START_SESSION_MODEL = 1, // Renamed

  // Logs the embedding model id used in the session.
  GROK_CLI_START_SESSION_EMBEDDING_MODEL = 2, // Renamed

  // Logs the sandbox that was used in the session.
  GROK_CLI_START_SESSION_SANDBOX = 3, // Renamed

  // Logs the core tools that were enabled in the session.
  GROK_CLI_START_SESSION_CORE_TOOLS = 4, // Renamed

  // Logs the approval mode that was used in the session.
  GROK_CLI_START_SESSION_APPROVAL_MODE = 5, // Renamed

  // Logs whether an API key was used in the session.
  GROK_CLI_START_SESSION_API_KEY_ENABLED = 6, // Renamed

  // Logs whether the Vertex API was used in the session.
  GROK_CLI_START_SESSION_VERTEX_API_ENABLED = 7, // Renamed (Consider if Vertex is relevant for Grok)

  // Logs whether debug mode was enabled in the session.
  GROK_CLI_START_SESSION_DEBUG_MODE_ENABLED = 8, // Renamed

  // Logs the MCP servers that were enabled in the session.
  GROK_CLI_START_SESSION_MCP_SERVERS = 9, // Renamed

  // Logs whether user-collected telemetry was enabled in the session.
  GROK_CLI_START_SESSION_TELEMETRY_ENABLED = 10, // Renamed

  // Logs whether prompt collection was enabled for user-collected telemetry.
  GROK_CLI_START_SESSION_TELEMETRY_LOG_USER_PROMPTS_ENABLED = 11, // Renamed

  // Logs whether the session was configured to respect gitignore files.
  GROK_CLI_START_SESSION_RESPECT_GITIGNORE = 12, // Renamed

  // ==========================================================================
  // User Prompt Event Keys
  // ===========================================================================

  // Logs the length of the prompt.
  GROK_CLI_USER_PROMPT_LENGTH = 13, // Renamed

  // ==========================================================================
  // Tool Call Event Keys
  // ===========================================================================

  // Logs the function name.
  GROK_CLI_TOOL_CALL_NAME = 14, // Renamed

  // Logs the user's decision about how to handle the tool call.
  GROK_CLI_TOOL_CALL_DECISION = 15, // Renamed

  // Logs whether the tool call succeeded.
  GROK_CLI_TOOL_CALL_SUCCESS = 16, // Renamed

  // Logs the tool call duration in milliseconds.
  GROK_CLI_TOOL_CALL_DURATION_MS = 17, // Renamed

  // Logs the tool call error message, if any.
  GROK_CLI_TOOL_ERROR_MESSAGE = 18, // Renamed

  // Logs the tool call error type, if any.
  GROK_CLI_TOOL_CALL_ERROR_TYPE = 19, // Renamed

  // ==========================================================================
  // GenAI API Request Event Keys
  // ===========================================================================

  // Logs the model id of the request.
  GROK_CLI_API_REQUEST_MODEL = 20, // Renamed

  // ==========================================================================
  // GenAI API Response Event Keys
  // ===========================================================================

  // Logs the model id of the API call.
  GROK_CLI_API_RESPONSE_MODEL = 21, // Renamed

  // Logs the status code of the response.
  GROK_CLI_API_RESPONSE_STATUS_CODE = 22, // Renamed

  // Logs the duration of the API call in milliseconds.
  GROK_CLI_API_RESPONSE_DURATION_MS = 23, // Renamed

  // Logs the error message of the API call, if any.
  GROK_CLI_API_ERROR_MESSAGE = 24, // Renamed

  // Logs the input token count of the API call.
  GROK_CLI_API_RESPONSE_INPUT_TOKEN_COUNT = 25, // Renamed

  // Logs the output token count of the API call.
  GROK_CLI_API_RESPONSE_OUTPUT_TOKEN_COUNT = 26, // Renamed

  // Logs the cached token count of the API call.
  GROK_CLI_API_RESPONSE_CACHED_TOKEN_COUNT = 27, // Renamed

  // Logs the thinking token count of the API call.
  GROK_CLI_API_RESPONSE_THINKING_TOKEN_COUNT = 28, // Renamed

  // Logs the tool use token count of the API call.
  GROK_CLI_API_RESPONSE_TOOL_TOKEN_COUNT = 29, // Renamed

  // ==========================================================================
  // GenAI API Error Event Keys
  // ===========================================================================

  // Logs the model id of the API call.
  GROK_CLI_API_ERROR_MODEL = 30, // Renamed

  // Logs the error type.
  GROK_CLI_API_ERROR_TYPE = 31, // Renamed

  // Logs the status code of the error response.
  GROK_CLI_API_ERROR_STATUS_CODE = 32, // Renamed

  // Logs the duration of the API call in milliseconds.
  GROK_CLI_API_ERROR_DURATION_MS = 33, // Renamed

  // ==========================================================================
  // End Session Event Keys
  // ===========================================================================

  // Logs the end of a session.
  GROK_CLI_END_SESSION_ID = 34, // Renamed
}

export function getEventMetadataKey(
  keyName: string,
): EventMetadataKey | undefined {
  // Access the enum member by its string name
  const key = EventMetadataKey[keyName as keyof typeof EventMetadataKey];

  // Check if the result is a valid enum member (not undefined and is a number)
  if (typeof key === 'number') {
    return key;
  }
  return undefined;
}
