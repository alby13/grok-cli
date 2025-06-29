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
import { GrokApiClient } from './grokClient.js'; // Added import
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
  USE_XAI_API_KEY = 'xai-api-key', // Renamed and will be the only one
  // LOGIN_WITH_GOOGLE_PERSONAL = 'oauth-personal', // To be removed
  // USE_GEMINI = 'gemini-api-key', // To be removed
  // USE_VERTEX_AI = 'vertex-ai', // To be removed
  // USE_GROK = 'grok-api-key', // To be removed (superceded by USE_XAI_API_KEY)
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
  explicitApiKey?: string, // Added explicitApiKey parameter
): Promise<ContentGeneratorConfig> {
  const geminiApiKeyFromEnv = process.env.GEMINI_API_KEY;
  const grokApiKeyFromEnv = process.env.GROK_API_KEY;
  const googleApiKeyFromEnv = process.env.GOOGLE_API_KEY;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION;

  // Use runtime model from config if available, otherwise fallback to parameter or default
  const effectiveModel = config?.getModel?.() || model || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
  };

  // if we are using google auth nothing else to validate for now
  if (authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI) {
    const apiKeyToUse = explicitApiKey ?? geminiApiKeyFromEnv;
    if (apiKeyToUse) {
      contentGeneratorConfig.apiKey = apiKeyToUse;
      contentGeneratorConfig.model = await getEffectiveModel(
        contentGeneratorConfig.apiKey,
        contentGeneratorConfig.model,
      );
      return contentGeneratorConfig;
    }
  }

  if (authType === AuthType.USE_GROK) {
    const apiKeyToUse = explicitApiKey ?? grokApiKeyFromEnv;
    if (apiKeyToUse) {
      contentGeneratorConfig.apiKey = apiKeyToUse;
      // TODO: Add model validation for Grok if needed
      // contentGeneratorConfig.model = await getEffectiveModel(
      //   contentGeneratorConfig.apiKey,
    //   contentGeneratorConfig.model,
    // );
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_VERTEX_AI) {
    // For Vertex AI, GOOGLE_API_KEY is often used, or ADC.
    // Explicit API key might not be as common here if ADC is preferred.
    // Prioritizing explicitApiKey if provided, otherwise environment variable.
    const apiKeyToUse = explicitApiKey ?? googleApiKeyFromEnv;
    if (
      apiKeyToUse && // If using explicit key for Vertex, project/location still needed from env
      googleCloudProject &&
      googleCloudLocation
    ) {
      contentGeneratorConfig.apiKey = apiKeyToUse;
      contentGeneratorConfig.vertexai = true;
      contentGeneratorConfig.model = await getEffectiveModel(
        contentGeneratorConfig.apiKey,
        contentGeneratorConfig.model,
      );
      return contentGeneratorConfig;
    } else if (
      // Fallback to ADC if no explicit/env key but project/location are set
      !apiKeyToUse &&
      googleCloudProject &&
      googleCloudLocation
    ) {
      // When apiKey is not set for Vertex, GoogleGenAI uses ADC
      contentGeneratorConfig.vertexai = true;
      contentGeneratorConfig.model = await getEffectiveModel(
        undefined, // No API key, rely on ADC
        contentGeneratorConfig.model,
        true, // isVertex
      );
      return contentGeneratorConfig;
    }
  }

  // If no specific auth type with a key was matched, return the config.
  // createContentGenerator will later throw an error if the authType requires a key and none was found.
  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (config.authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return createCodeAssistContentGenerator(httpOptions, config.authType);
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });

    return googleGenAI.models;
  }

  if (config.authType === AuthType.USE_GROK) {
    if (!config.apiKey) {
      throw new Error(
        'Grok API key is required for AuthType.USE_GROK but was not provided.',
      );
    }
    return new GrokApiClient(config.apiKey);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
