/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { GrokApiClient } from './grokClient.js';

import OpenAI from 'openai';

// Mock OpenAI
vi.mock('openai', () => {
  const mockChatCompletionsCreate = vi.fn();
  const MockOpenAI = vi.fn(() => ({
    chat: {
      completions: {
        create: mockChatCompletionsCreate,
      },
    },
    // embeddings: { create: mockEmbeddingsCreate }, // If testing embedContent
  }));
  return {
    OpenAI: MockOpenAI,
    default: MockOpenAI, // Handling default export if OpenAI uses it
  };
});

describe('GrokApiClient', () => {
  const apiKey = 'test-grok-api-key';
  const model = 'grok-3';
  let client: GrokApiClient;
  let mockCreate: vi.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Get the mock function from the mocked OpenAI instance
    // This is a bit indirect due to how vi.mock works with classes and default exports
    const MockedOpenAI = OpenAI as unknown as vi.Mock;
    const mockOpenAIInstance = new MockedOpenAI();
    mockCreate = mockOpenAIInstance.chat.completions.create;

    client = new GrokApiClient(apiKey, model);
  });

  it('should be instantiated with an API key and model, and initialize OpenAI client', () => {
    expect(client).toBeInstanceOf(GrokApiClient);
    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: apiKey,
      baseURL: 'https://api.x.ai/v1',
    });
  });

  describe('generateContent', () => {
    it('should call OpenAI chat.completions.create with correct parameters and map response', async () => {
      const request = {
        contents: [{ role: 'user', parts: [{ text: 'Hello Grok' }] }],
        generationConfig: {
          temperature: 0.5,
          topP: 0.9,
          maxOutputTokens: 100,
          candidateCount: 2,
          stopSequences: ['\n'],
        },
      };
      const mockApiResponse = {
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello User' },
            finish_reason: 'stop',
          },
          {
            index: 1,
            message: { role: 'assistant', content: 'Hi User' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      mockCreate.mockResolvedValue(mockApiResponse);

      const response = await client.generateContent(request as any);

      expect(mockCreate).toHaveBeenCalledWith({
        model: model,
        messages: [{ role: 'user', content: 'Hello Grok' }],
        temperature: 0.5,
        top_p: 0.9,
        max_tokens: 100,
        n: 2,
        stop: ['\n'],
        stream: false,
      });
      expect(response.candidates).toHaveLength(2);
      expect(response.candidates?.[0].content?.parts[0].text).toBe(
        'Hello User',
      );
      expect(response.candidates?.[0].content?.role).toBe('model');
      expect(response.usageMetadata?.promptTokenCount).toBe(10);
      expect(response.usageMetadata?.candidatesTokenCount).toBe(5);
      expect(response.usageMetadata?.totalTokenCount).toBe(15);
    });

    it('should correctly send tool responses with tool_call_id', async () => {
      // Simulate a previous call that resulted in a tool_call
      client['lastToolCallIds'] = [
        { name: 'get_weather', id: 'tool_call_id_123' },
      ];

      const requestWithToolResponse = {
        contents: [
          {
            role: 'tool',
            parts: [
              {
                functionResponse: {
                  name: 'get_weather',
                  response: { weather: 'sunny' },
                },
              },
            ],
          },
        ],
      };

      const mockApiResponse = {
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'The weather is sunny.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      };
      mockCreate.mockResolvedValue(mockApiResponse);

      await client.generateContent(requestWithToolResponse as any);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'tool',
              tool_call_id: 'tool_call_id_123',
              name: 'get_weather',
              content: '{"weather":"sunny"}',
            }),
          ]),
        }),
      );
    });
  });

  describe('generateContentStream', () => {
    it('should call OpenAI chat.completions.create with stream true and correct generation parameters', async () => {
      const request = {
        contents: [{ role: 'user', parts: [{ text: 'Stream to Grok' }] }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 50,
          candidateCount: 1, // n=1 for streaming typically
          stopSequences: ['stop'],
        },
      };
      const mockStreamChunks = [
        {
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Streaming...' },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: { content: ' Done.' },
              finish_reason: 'stop',
            },
          ],
        },
      ];

      async function* mockStream() {
        for (const chunk of mockStreamChunks) {
          yield chunk;
        }
      }
      mockCreate.mockResolvedValue(mockStream());

      const generator = await client.generateContentStream(request as any);
      const responses = [];
      for await (const res of generator) {
        responses.push(res);
      }

      expect(mockCreate).toHaveBeenCalledWith({
        model: model,
        messages: [{ role: 'user', content: 'Stream to Grok' }],
        temperature: 0.2,
        top_p: 0.8,
        max_tokens: 50,
        n: 1,
        stop: ['stop'],
        stream: true,
      });
      expect(responses).toHaveLength(2);
    });

    it('should correctly send tool responses in a stream context', async () => {
      client['lastToolCallIds'] = [
        { name: 'get_temperature', id: 'tool_call_id_456' },
      ];
      const requestWithToolResponse = {
        contents: [
          {
            role: 'tool',
            parts: [
              {
                functionResponse: {
                  name: 'get_temperature',
                  response: { temperature: '25C' },
                },
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.1 },
      };

      const mockStreamChunks = [
        {
          choices: [
            { index: 0, delta: { role: 'assistant', content: 'Temp is 25C.' } },
          ],
        },
      ];
      async function* mockStream() {
        for (const chunk of mockStreamChunks) {
          yield chunk;
        }
      }
      mockCreate.mockResolvedValue(mockStream());

      const generator = await client.generateContentStream(
        requestWithToolResponse as any,
      );
      // Consume the stream
      for await (const _ of generator) {
        // no-op
      }

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'tool',
              tool_call_id: 'tool_call_id_456',
              name: 'get_temperature',
              content: '{"temperature":"25C"}',
            }),
          ]),
          stream: true,
        }),
      );
      // Assertions about response content are not the focus of this specific test case,
      // which is about sending tool responses. Other tests cover response mapping.
    });
  });

  describe('countTokens', () => {
    it('should return an estimated token count and log a warning', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const request = {
        contents: [{ role: 'user', parts: [{ text: 'Count these tokens' }] }],
      };
      const response = await client.countTokens(request as any);
      expect(response.totalTokens).toBe(Math.ceil('Count these tokens'.length / 4));
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'GrokApiClient.countTokens currently uses a rough estimation (1 token ~ 4 chars) as a direct Grok token counting method is not available. This may be inaccurate.',
      );
      consoleWarnSpy.mockRestore();
    });
  });

  describe('embedContent', () => {
    it('should throw a not implemented error and log a warning', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const request = {
        contents: [{ role: 'user', parts: [{ text: 'Embed this' }] }],
      };
      await expect(client.embedContent(request as any)).rejects.toThrow(
        'GrokApiClient.embedContent is not implemented due to unknown Grok embedding capabilities.',
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'GrokApiClient.embedContent is not implemented as Grok embedding capabilities are currently unknown. Please refer to xAI documentation for embedding support.',
      );
      consoleWarnSpy.mockRestore();
    });
  });
});
