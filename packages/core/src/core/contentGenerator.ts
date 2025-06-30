/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  GoogleGenAI,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { getEffectiveModel } from './modelCheck.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
}

export enum AuthType {
  USE_XAI_API_KEY = 'xai-api-key',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
};

export async function createContentGeneratorConfig(
  model: string | undefined,
  authType: AuthType | undefined,
  config?: { getModel?: () => string },
): Promise<ContentGeneratorConfig> {
  const xaiApiKey = process.env.XAI_API_KEY;
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION;

  // Use runtime model from config if available, otherwise fallback to parameter or default
  const effectiveModel = config?.getModel?.() || model || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
  };

  // Only USE_XAI_API_KEY path remains
  if (authType === AuthType.USE_XAI_API_KEY) {
    if (xaiApiKey) {
      contentGeneratorConfig.apiKey = xaiApiKey;
      // Model effectiveness check might need to be adapted or removed if not applicable to Grok
      contentGeneratorConfig.model = await getEffectiveModel(
        contentGeneratorConfig.apiKey,
        contentGeneratorConfig.model,
      );
    } else {
      // Handle missing API key for Grok if necessary, or assume it's always present by this stage
      // For now, if key is missing, it will proceed without apiKey set,
      // which might be caught by the SDK or API call later.
    }
  } else if (authType) {
    // This case should ideally not be reached if AuthType is simplified
    // and calling code ensures only USE_XAI_API_KEY is passed.
    // Consider throwing an error for unsupported (now removed) AuthTypes if they slip through.
    console.warn(`Unsupported AuthType encountered in createContentGeneratorConfig: ${authType}`);
  }


  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GrokCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };

  // Only USE_GROK_API_KEY path remains
  if (config.authType === AuthType.USE_GROK_API_KEY) {
    // Assuming Grok will use a different SDK, e.g., OpenAI SDK
    // This part needs to be replaced with actual Grok SDK initialization
    // For now, I'll comment out GoogleGenAI and put a placeholder.
    // const googleGenAI = new GoogleGenAI({
    //   apiKey: config.apiKey === '' ? undefined : config.apiKey,
    //   vertexai: false, // Grok does not use Vertex AI
    //   httpOptions,
    // });
    // return googleGenAI.models;

    // Placeholder for Grok SDK integration:
    if (!config.apiKey) {
       throw new Error('XAI_API_KEY is required for GrokClient.');
    }
    // Example: const grokApi = new GrokSDK({ apiKey: config.apiKey, httpOptions });
    // return grokApi.models; // Or however the Grok SDK provides the generator
    throw new Error('Grok SDK integration not yet implemented.');
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}. Expected USE_XAI_API_KEY.`,
  );
}
