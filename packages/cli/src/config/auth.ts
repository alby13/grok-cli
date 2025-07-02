/**
 * @license
 * Copyright 2025 alby13
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@alby13/grok-cli-core';
import { loadEnvironment } from './config.js';

export const validateAuthMethod = (authMethod: string): string | null => {
  loadEnvironment(); // Ensures .env variables are loaded

  // Primary authentication method for Grok CLI will be API Key.
  // We'll keep AuthType.USE_XAI as the representation for this.
  // Other AuthTypes like LOGIN_WITH_GOOGLE_PERSONAL, USE_GEMINI, USE_VERTEX_AI
  // are no longer relevant and will be removed or adapted in the core package.

  if (authMethod === AuthType.USE_XAI) { // Assuming AuthType.USE_XAI will be the standard
    if (!process.env.GROK_API_KEY) {
      return 'GROK_API_KEY environment variable not found. Please set it in your environment (e.g., in a .env file) and try again.';
    }
    // Potentially add further validation for the API key format if xAI specifies one.
    return null; // API key found, validation passes for now.
  }

  // Handling cases where old auth methods might still be in user config
  // or if other methods are introduced later for xAI.
  if (
    authMethod === AuthType.LOGIN_WITH_GOOGLE_PERSONAL ||
    authMethod === AuthType.USE_GEMINI ||
    authMethod === AuthType.USE_VERTEX_AI
  ) {
    return `Auth method '${authMethod}' is not supported for Grok CLI. Please use an API key (GROK_API_KEY).`;
  }

  // Fallback for any other unexpected auth method string
  return `Invalid or unsupported authentication method selected: '${authMethod}'. Please configure GROK_API_KEY.`;
};
