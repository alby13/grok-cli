/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 */

type Model = string;
type TokenCount = number;

/**
 * The default token limit, set to the standard for the Grok-3 series.
 */
export const DEFAULT_TOKEN_LIMIT = 131_072;

/**
 * Returns the context window size (in tokens) for a given xAI model.
 * @param model The name of the model, e.g., "grok-3".
 * @returns The token limit for the specified model.
 */
export function tokenLimit(model: Model): TokenCount {
  // Model information is based on xAI's ocumentation.
  switch (model) {
    // Current generation models with a large context window.
    case 'grok-3':
    case 'grok-3-mini':
        return 131_072; [7, 10]

    // The token limit is assumed to be at least as large as grok-3.
    case 'grok-4':
        return 131_072;

    default:
      // If the model isn't explicitly listed, fall back to the grok-3 default.
      console.warn(
        `Token limit for model "${model}" is not explicitly defined. Falling back to default of ${DEFAULT_TOKEN_LIMIT}.`,
      );
      return DEFAULT_TOKEN_LIMIT;
  }
}
