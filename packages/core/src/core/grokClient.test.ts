/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { GrokApiClient } from './grokClient.js';

describe('GrokApiClient', () => {
  const apiKey = 'test-grok-api-key';
  let client: GrokApiClient;

  beforeEach(() => {
    client = new GrokApiClient(apiKey);
  });

  it('should be instantiated with an API key', () => {
    expect(client).toBeInstanceOf(GrokApiClient);
  });

  describe('generateContent', () => {
    it('should throw a not implemented error', async () => {
      await expect(client.generateContent({} as any)).rejects.toThrow(
        'GrokApiClient.generateContent not yet implemented.',
      );
    });
  });

  describe('generateContentStream', () => {
    it('should throw a not implemented error', async () => {
      await expect(client.generateContentStream({} as any)).rejects.toThrow(
        'GrokApiClient.generateContentStream not yet implemented.',
      );
    });
  });

  describe('countTokens', () => {
    it('should throw a not implemented error', async () => {
      await expect(client.countTokens({} as any)).rejects.toThrow(
        'GrokApiClient.countTokens not yet implemented.',
      );
    });
  });

  describe('embedContent', () => {
    it('should throw a not implemented error', async () => {
      await expect(client.embedContent({} as any)).rejects.toThrow(
        'GrokApiClient.embedContent not yet implemented.',
      );
    });
  });
});
