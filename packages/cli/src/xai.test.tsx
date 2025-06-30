/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { main } from './xai.js'; // Testing the new file
import { LoadedSettings, SettingsFile, loadSettings } from './config/settings.js';

// Custom error to identify mock process.exit calls
class MockProcessExitError extends Error {
  constructor(readonly code?: string | number | null | undefined) {
    super('PROCESS_EXIT_MOCKED');
    this.name = 'MockProcessExitError';
  }
}

// --- Mocking Core Dependencies ---

// Mock settings and config loaders
vi.mock('./config/settings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config/settings.js')>();
  return { ...actual, loadSettings: vi.fn() };
});

vi.mock('./config/config.js', () => ({
  loadCliConfig: vi.fn().mockResolvedValue({
    // Provide a mock config object that our client can use
    getQuestion: vi.fn(() => ''),
    getDebugMode: vi.fn(() => false),
    getSandbox: vi.fn(() => false),
    getApiKey: vi.fn(() => 'test-api-key'),
    getModel: vi.fn(() => 'grok-3'),
    getEmbeddingModel: vi.fn(() => 'grok-embedding-model'),
    // Mock other methods as needed by the setup process
    getFileService: vi.fn(),
    getGitService: vi.fn(),
    getCheckpointingEnabled: vi.fn(() => false),
    getToolRegistry: vi.fn().mockResolvedValue({ getOpenAIToolDeclarations: vi.fn(() => []) }),
    refreshAuth: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock the entire core package to control XaiClient and CoreToolScheduler
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  
  // Mock XaiClient
  const mockSendMessageStream = vi.fn();
  const XaiClientMock = vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    sendMessageStream: mockSendMessageStream,
    addHistory: vi.fn(),
    getConfig: vi.fn().mockReturnValue({ getToolRegistry: vi.fn().mockResolvedValue({}) }),
  }));
  
  // Mock CoreToolScheduler
  const mockSchedule = vi.fn();
  const CoreToolSchedulerMock = vi.fn(() => ({
    schedule: mockSchedule,
  }));

  return {
    ...actual,
    XaiClient: XaiClientMock,
    CoreToolScheduler: CoreToolSchedulerMock,
    // Provide default exports for other utilities if needed
    sessionId: 'test-session-id',
    logUserPrompt: vi.fn(),
    AuthType: { USE_XAI: 'USE_XAI' }, // Mock the AuthType enum
  };
});


// Mock other file-system and environment dependencies
vi.mock('./utils/sandbox.js', () => ({
  start_sandbox: vi.fn(() => Promise.resolve()),
}));

vi.mock('./config/auth.js', () => ({
  validateAuthMethod: vi.fn(() => null),
}));

describe('xai.tsx main function', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let loadSettingsMock: ReturnType<typeof vi.mocked<typeof loadSettings>>;
  let originalEnvXaiSandbox: string | undefined;

  const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new MockProcessExitError(code);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    loadSettingsMock = vi.mocked(loadSettings);

    originalEnvXaiSandbox = process.env.XAI_SANDBOX;
    delete process.env.XAI_SANDBOX;

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalEnvXaiSandbox !== undefined) {
      process.env.XAI_SANDBOX = originalEnvXaiSandbox;
    } else {
      delete process.env.XAI_SANDBOX;
    }
  });

  it('should call process.exit(1) if settings have errors', async () => {
    const settingsError = { message: 'Test settings error', path: '/test/settings.json' };
    const mockLoadedSettings = new LoadedSettings(
      { path: '/user/settings.json', settings: {} },
      { path: '/workspace/.xai/settings.json', settings: {} },
      [settingsError],
    );

    loadSettingsMock.mockReturnValue(mockLoadedSettings);

    await expect(main()).rejects.toThrow(MockProcessExitError);

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error in /test/settings.json: Test settings error');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Please fix /test/settings.json and try again.');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should run non-interactive mode with a simple text response', async () => {
    // Arrange: Setup mocks for a non-interactive run
    const mockLoadedSettings = new LoadedSettings(
      { path: '/user/settings.json', settings: {} },
      { path: '/workspace/.xai/settings.json', settings: {} },
      [],
    );
    loadSettingsMock.mockReturnValue(mockLoadedSettings);

    const { loadCliConfig } = await import('./config/config.js');
    vi.mocked(loadCliConfig).mockResolvedValue({
      ...vi.mocked(loadCliConfig).getMockImplementation()?.(),
      getQuestion: vi.fn(() => 'hello world'), // Provide input via config
    } as any);

    // Mock the stream response from XaiClient
    const { XaiClient } = await import('@google/gemini-cli-core');
    const mockStream = async function* () {
      yield { type: 'contentDelta', value: 'Hello back!' };
      // Generator returns the final Turn object
      return { pendingToolCalls: [] };
    };
    vi.mocked(XaiClient).mock.results[0].value.sendMessageStream.mockReturnValue(mockStream());

    // Act & Assert
    await expect(main()).rejects.toThrow(MockProcessExitError);
    expect(processExitSpy).toHaveBeenCalledWith(0); // Should exit cleanly
  });

  it('should handle a tool call in non-interactive mode', async () => {
     // Arrange
    const mockLoadedSettings = new LoadedSettings({ path: '/user/settings.json', settings: {} }, { path: '/workspace/.xai/settings.json', settings: {} }, []);
    loadSettingsMock.mockReturnValue(mockLoadedSettings);

    const { loadCliConfig } = await import('./config/config.js');
    vi.mocked(loadCliConfig).mockResolvedValue({
      ...vi.mocked(loadCliConfig).getMockImplementation()?.(),
      getQuestion: vi.fn(() => 'list files'),
    } as any);
    
    // Mock the scheduler and the two turns of the conversation
    const { XaiClient, CoreToolScheduler } = await import('@google/gemini-cli-core');
    const xaiClientInstance = vi.mocked(XaiClient).mock.results[0].value;
    const schedulerInstance = vi.mocked(CoreToolScheduler).mock.results[0].value;

    // Turn 1: Model requests a tool call
    const turn1Stream = async function* () {
      yield { type: 'contentDelta', value: 'Okay, I will list the files.' };
      return { pendingToolCalls: [{ id: 'call123', type: 'function', function: { name: 'ls', arguments: '{}' } }] };
    };

    // Turn 2: Model responds after getting tool results
    const turn2Stream = async function* () {
      yield { type: 'contentDelta', value: 'The files are file1.txt and file2.txt.' };
      return { pendingToolCalls: [] }; // No more tool calls
    };
    
    xaiClientInstance.sendMessageStream
      .mockReturnValueOnce(turn1Stream()) // First call returns tool request
      .mockReturnValueOnce(turn2Stream()); // Second call returns final text

    // Mock the scheduler to immediately call the completion handler
    vi.mocked(schedulerInstance.schedule).mockImplementation(async () => {
      const { onAllToolCallsComplete } = vi.mocked(CoreToolScheduler).mock.calls[0][0];
      onAllToolCallsComplete?.([{ role: 'tool', tool_call_id: 'call123', content: 'file1.txt\nfile2.txt' }]);
    });

    // Act & Assert
    await expect(main()).rejects.toThrow(MockProcessExitError);
    
    // Verify that the scheduler was called with the correct tool call
    expect(schedulerInstance.schedule).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'call123' })]),
      expect.any(AbortSignal)
    );
    
    // Verify the tool result was added to history
    expect(xaiClientInstance.addHistory).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'tool', tool_call_id: 'call123' })
    );

    // Verify the conversation continued
    expect(xaiClientInstance.sendMessageStream).toHaveBeenCalledTimes(2);
    expect(xaiClientInstance.sendMessageStream).toHaveBeenCalledWith(
      'Please analyze the results of the tools I just ran and continue with the task.',
      expect.any(AbortSignal)
    );

    expect(processExitSpy).toHaveBeenCalledWith(0);
  });
});
