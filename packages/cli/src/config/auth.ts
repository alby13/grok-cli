/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@google/gemini-cli-core';
import { loadEnvironment } from './config.js';

export const validateAuthMethod = (authMethod: string): string | null => {
  loadEnvironment();
  if (authMethod === AuthType.USE_XAI_API_KEY) {
    if (!process.env.XAI_API_KEY) {
      return 'XAI_API_KEY environment variable not found. Add that to your .env and try again, no reload needed!';
    }
    return null;
  }
  // All other auth types are now invalid.
  return `Invalid auth method selected. Only USE_XAI_API_KEY is supported.`;
};
