/**
 * @license
 * Copyright 2025 alby13
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';
import { type MCPServerConfig } from '@alby13/grok-cli-core';

interface ContextSummaryDisplayProps {
  grokMdFileCount: number;
  contextFileNames: string[];
  mcpServers?: Record<string, MCPServerConfig>;
  showToolDescriptions?: boolean;
}

export const ContextSummaryDisplay: React.FC<ContextSummaryDisplayProps> = ({
  grokMdFileCount, // Renamed
  contextFileNames,
  mcpServers,
  showToolDescriptions,
}) => {
  const mcpServerCount = Object.keys(mcpServers || {}).length;

  if (grokMdFileCount === 0 && mcpServerCount === 0) { // Renamed
    return <Text> </Text>; // Render an empty space to reserve height
  }

  const grokMdText = (() => { // Renamed
    if (grokMdFileCount === 0) { // Renamed
      return '';
    }
    const allNamesTheSame = new Set(contextFileNames).size < 2;
    const name = allNamesTheSame ? contextFileNames[0] : 'context'; // Name could be GROK.md
    return `${grokMdFileCount} ${name} file${ // Renamed
      grokMdFileCount > 1 ? 's' : ''
    }`;
  })();

  const mcpText =
    mcpServerCount > 0
      ? `${mcpServerCount} MCP server${mcpServerCount > 1 ? 's' : ''}`
      : '';

  let summaryText = 'Using ';
  if (grokMdText) { // Renamed
    summaryText += grokMdText; // Renamed
  }
  if (grokMdText && mcpText) { // Renamed
    summaryText += ' and ';
  }
  if (mcpText) {
    summaryText += mcpText;
    // Add ctrl+t hint when MCP servers are available
    if (mcpServers && Object.keys(mcpServers).length > 0) {
      if (showToolDescriptions) {
        summaryText += ' (ctrl+t to toggle)';
      } else {
        summaryText += ' (ctrl+t to view)';
      }
    }
  }

  return <Text color={Colors.Gray}>{summaryText}</Text>;
};
