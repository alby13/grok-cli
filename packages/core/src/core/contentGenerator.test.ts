/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { createContentGenerator, AuthType } from './contentGenerator.js';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { GoogleGenAI } from '@google/genai';

vi.mock('../code_assist/codeAssist.js');
vi.mock('@google/genai');

describe('contentGenerator', () => {
  it('should create a CodeAssistContentGenerator', async () => {
    const mockGenerator = {} as unknown;
    vi.mocked(createCodeAssistContentGenerator).mockResolvedValue(
      mockGenerator as never,
    );
    const generator = await createContentGenerator({
      model: 'test-model',
      authType: AuthType.LOGIN_WITH_GOOGLE_PERSONAL,
    });
    expect(createCodeAssistContentGenerator).toHaveBeenCalled();
    expect(generator).toBe(mockGenerator);
  });

  it('should create a GoogleGenAI content generator', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    const generator = await createContentGenerator({
      model: 'test-model',
      apiKey: 'test-api-key',
      authType: AuthType.USE_GEMINI,
    });
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      vertexai: undefined,
      httpOptions: {
        headers: {
          'User-Agent': expect.any(String),
        },
      },
    });
    expect(generator).toBe((mockGenerator as GoogleGenAI).models);
  });

  it('should create a GrokApiClient content generator', async () => {
    // Mock GrokApiClient if it had complex constructor logic or static methods to spy on
    // For now, we're just checking if it's instantiated.
    const generator = await createContentGenerator({
      model: 'test-grok-model',
      apiKey: 'test-grok-api-key',
      authType: AuthType.USE_GROK,
    });
    // Check if the returned object is an instance of GrokApiClient
    // This requires GrokApiClient to be imported or mocked in a way that its type is known
    // For simplicity here, we'll check for the methods it's supposed to have,
    // assuming it's not easily mockable without more setup.
    expect(generator).toHaveProperty('generateContent');
    expect(generator).toHaveProperty('generateContentStream');
    expect(generator).toHaveProperty('countTokens');
    expect(generator).toHaveProperty('embedContent');
    // If we could import GrokApiClient here, we'd do:
    // import { GrokApiClient } from './grokClient.js';
    // expect(generator).toBeInstanceOf(GrokApiClient);
  });

  it('should throw an error for USE_GROK if apiKey is missing', async () => {
    await expect(
      createContentGenerator({
        model: 'test-grok-model',
        authType: AuthType.USE_GROK,
        // apiKey is intentionally omitted
      }),
    ).rejects.toThrow(
      'Grok API key is required for AuthType.USE_GROK but was not provided.',
    );
  });

  it('should throw an error for unsupported authType', async () => {
    await expect(
      createContentGenerator({
        model: 'test-model',
        authType: 'unsupported-auth-type' as AuthType,
      }),
    ).rejects.toThrow('Error creating contentGenerator: Unsupported authType');
  });
});
