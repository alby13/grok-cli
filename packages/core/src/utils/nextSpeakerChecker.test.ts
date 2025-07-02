/**
 * @license
 * Copyright 2025 alby13
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, Mock, afterEach } from 'vitest';
import { Content, GoogleGenAI, Models } from '@google/genai'; // Keep @google/genai for now
import { XaiClient } from '../core/xaiclient.js'; // Changed from GeminiClient
import { Config } from '../config/config.js';
import { checkNextSpeaker, NextSpeakerResponse } from './nextSpeakerChecker.js';
import { GeminiChat } from '../core/geminiChat.js'; // This class name might also need update if it exists

// Mock XaiClient and Config constructor
vi.mock('../core/xaiclient.js'); // Changed
vi.mock('../config/config.js');

// Define mocks for GenAI and Models instances that will be used across tests
const mockModelsInstance = {
  generateContent: vi.fn(),
  generateContentStream: vi.fn(),
  countTokens: vi.fn(),
  embedContent: vi.fn(),
  batchEmbedContents: vi.fn(),
} as unknown as Models;

const mockXaiGenAIInstance = { // Renamed
  getGenerativeModel: vi.fn().mockReturnValue(mockModelsInstance),
} as unknown as GoogleGenAI; // Keep type for now

vi.mock('@google/genai', async () => {
  const actualGenAI =
    await vi.importActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actualGenAI,
    GoogleGenAI: vi.fn(() => mockXaiGenAIInstance), // Renamed instance
  };
});

describe('checkNextSpeaker', () => {
  let chatInstance: GeminiChat; // Placeholder, might need to be XaiChat
  let mockXaiClient: XaiClient; // Renamed
  let MockConfig: Mock;
  const abortSignal = new AbortController().signal;

  beforeEach(() => {
    MockConfig = vi.mocked(Config);
    const mockConfigInstance = new MockConfig(
      'test-api-key',
      'grok-3-latest', // Changed model
      false,
      '.',
      false,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
    );

    mockXaiClient = new XaiClient(mockConfigInstance); // Renamed

    vi.mocked(mockModelsInstance.generateContent).mockReset();
    vi.mocked(mockModelsInstance.generateContentStream).mockReset();

    // chatInstance might need to be XaiChat if GeminiChat is renamed/refactored
    chatInstance = new GeminiChat(
      mockConfigInstance,
      mockModelsInstance,
      {},
      [],
    );

    vi.spyOn(chatInstance, 'getHistory');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return null if history is empty', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([]);
    const result = await checkNextSpeaker(
      chatInstance,
      mockXaiClient, // Renamed
      abortSignal,
    );
    expect(result).toBeNull();
    expect(mockXaiClient.generateJson).not.toHaveBeenCalled(); // Renamed
  });

  it('should return null if the last speaker was the user', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'user', parts: [{ text: 'Hello' }] },
    ] as Content[]);
    const result = await checkNextSpeaker(
      chatInstance,
      mockXaiClient, // Renamed
      abortSignal,
    );
    expect(result).toBeNull();
    expect(mockXaiClient.generateJson).not.toHaveBeenCalled(); // Renamed
  });

  it("should return { next_speaker: 'model' } when model intends to continue", async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'I will now do something.' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model stated it will do something.',
      next_speaker: 'model',
    };
    (mockXaiClient.generateJson as Mock).mockResolvedValue(mockApiResponse); // Renamed

    const result = await checkNextSpeaker(
      chatInstance,
      mockXaiClient, // Renamed
      abortSignal,
    );
    expect(result).toEqual(mockApiResponse);
    expect(mockXaiClient.generateJson).toHaveBeenCalledTimes(1); // Renamed
  });

  it("should return { next_speaker: 'user' } when model asks a question", async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'What would you like to do?' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model asked a question.',
      next_speaker: 'user',
    };
    (mockXaiClient.generateJson as Mock).mockResolvedValue(mockApiResponse); // Renamed

    const result = await checkNextSpeaker(
      chatInstance,
      mockXaiClient, // Renamed
      abortSignal,
    );
    expect(result).toEqual(mockApiResponse);
  });

  it("should return { next_speaker: 'user' } when model makes a statement", async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'This is a statement.' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 'user',
    };
    (mockXaiClient.generateJson as Mock).mockResolvedValue(mockApiResponse); // Renamed

    const result = await checkNextSpeaker(
      chatInstance,
      mockXaiClient, // Renamed
      abortSignal,
    );
    expect(result).toEqual(mockApiResponse);
  });

  it('should return null if xaiClient.generateJson throws an error', async () => { // Renamed
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockXaiClient.generateJson as Mock).mockRejectedValue( // Renamed
      new Error('API Error'),
    );

    const result = await checkNextSpeaker(
      chatInstance,
      mockXaiClient, // Renamed
      abortSignal,
    );
    expect(result).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('should return null if xaiClient.generateJson returns invalid JSON (missing next_speaker)', async () => { // Renamed
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockXaiClient.generateJson as Mock).mockResolvedValue({ // Renamed
      reasoning: 'This is incomplete.',
    } as unknown as NextSpeakerResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockXaiClient, // Renamed
      abortSignal,
    );
    expect(result).toBeNull();
  });

  it('should return null if xaiClient.generateJson returns a non-string next_speaker', async () => { // Renamed
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockXaiClient.generateJson as Mock).mockResolvedValue({ // Renamed
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 123,
    } as unknown as NextSpeakerResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockXaiClient, // Renamed
      abortSignal,
    );
    expect(result).toBeNull();
  });

  it('should return null if xaiClient.generateJson returns an invalid next_speaker string value', async () => { // Renamed
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockXaiClient.generateJson as Mock).mockResolvedValue({ // Renamed
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 'neither',
    } as unknown as NextSpeakerResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockXaiClient, // Renamed
      abortSignal,
    );
    expect(result).toBeNull();
  });
});
