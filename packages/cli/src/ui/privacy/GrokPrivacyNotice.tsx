/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

export function GrokPrivacyNotice(): React.JSX.Element {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Grok API Key Notice</Text>
      <Box marginTop={1}>
        <Text>
          {/* TODO: Update this with Grok's actual privacy policy and terms. */}
          <Text>
            By using a Grok API Key, your prompts, generated content, and
            related data will be processed by xAI in accordance with their
            terms of service and privacy policy.
          </Text>
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          {'Please review the xAI terms and privacy policy for more details: '}
          <Text color={Colors.AccentBlue}>
            [Link to Grok/xAI Terms of Service]
          </Text>
          {' and '}
          <Text color={Colors.AccentBlue}>
            [Link to Grok/xAI Privacy Policy]
          </Text>
        </Text>
      </Box>
    </Box>
  );
}
