/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import OpenAI from 'openai';
import { getErrorMessage } from '../utils/errors.js';

/**
 * Validates that a configured model is available from the xAI API using the
 * provided API key.
 *
 * @param apiKey The xAI API key.
 * @param configuredModel The model name from the user's configuration (e.g., "grok-3").
 * @returns The validated model name if successful.
 * @throws An error if the API key is invalid, the connection fails, or the
 *         model is not in the list of available models.
 */
export async function validateModel(
  apiKey: string,
  configuredModel: string,
): Promise<string> {
  // We don't need a proxy agent for this simple check.
  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.x.ai/v1',
  });

  try {
    const response = await client.models.list();
    const availableModels = response.data.map((model) => model.id);

    if (availableModels.includes(configuredModel)) {
      // Success! The configured model is valid.
      return configuredModel;
    } else {
      // The configured model is not in the list of available models.
      throw new Error(
        `The configured model "${configuredModel}" is not available.` +
        `\nAvailable models for your API key are: ${availableModels.join(', ')}`,
      );
    }
  } catch (e: unknown) {
    // Check for specific authentication errors from the OpenAI SDK.
    if (e instanceof OpenAI.APIError) {
      if (e.status === 401) {
        throw new Error(
          'Failed to validate model: The provided XAI_API_KEY is invalid or has expired.',
        );
      }
      // Re-throw other API errors with more context.
      throw new Error(
        `Failed to validate model due to an API error: ${e.message} (Status: ${e.status})`,
      );
    }

    // Handle generic network errors.
    throw new Error(`Failed to connect to the xAI API to validate the model: ${getErrorMessage(e)}`);
  }
}
