/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const SERVICE_NAME = 'grok-cli';

export const EVENT_USER_PROMPT = 'grok_cli.user_prompt';
export const EVENT_TOOL_CALL = 'grok_cli.tool_call';
export const EVENT_API_REQUEST = 'grok_cli.api_request';
export const EVENT_API_ERROR = 'grok_cli.api_error';
export const EVENT_API_RESPONSE = 'grok_cli.api_response';
export const EVENT_CLI_CONFIG = 'grok_cli.config';

export const METRIC_TOOL_CALL_COUNT = 'grok_cli.tool.call.count';
export const METRIC_TOOL_CALL_LATENCY = 'grok_cli.tool.call.latency';
export const METRIC_API_REQUEST_COUNT = 'grok_cli.api.request.count';
export const METRIC_API_REQUEST_LATENCY = 'grok_cli.api.request.latency';
export const METRIC_TOKEN_USAGE = 'grok_cli.token.usage';
export const METRIC_SESSION_COUNT = 'grok_cli.session.count';
export const METRIC_FILE_OPERATION_COUNT = 'grok_cli.file.operation.count';
