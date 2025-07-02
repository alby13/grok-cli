#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

const projectRoot = join(import.meta.dirname, '..');

const SETTINGS_DIRECTORY_NAME = '.grok'; // Renamed
const USER_SETTINGS_DIR = join(
  process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '',
  SETTINGS_DIRECTORY_NAME,
);
const USER_SETTINGS_PATH = join(USER_SETTINGS_DIR, 'settings.json');
const WORKSPACE_SETTINGS_PATH = join(
  projectRoot,
  SETTINGS_DIRECTORY_NAME,
  'settings.json',
);

let settingsTarget = undefined; // This logic might be simplified or removed if only local is supported

function loadSettingsValue(filePath) {
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      const jsonContent = content.replace(/\/\/[^\n]*/g, ''); // Basic comment removal
      const settings = JSON.parse(jsonContent);
      // For this homemade CLI, we'll assume 'local' is the only valid target from settings for now.
      // If settings.telemetry.target is 'gcp' or something else, we can warn or ignore.
      if (settings.telemetry?.target && settings.telemetry.target !== 'local') {
        console.warn(
          `⚠️ Warning: Telemetry target '${settings.telemetry.target}' in ${filePath} is not supported for this CLI. Defaulting to local (if enabled).`,
        );
      }
      return settings.telemetry?.target === 'local' ? 'local' : undefined;
    }
  } catch (e) {
    console.warn(
      `⚠️ Warning: Could not parse settings file at ${filePath}: ${e.message}`,
    );
  }
  return undefined;
}

settingsTarget = loadSettingsValue(WORKSPACE_SETTINGS_PATH);

if (!settingsTarget) {
  settingsTarget = loadSettingsValue(USER_SETTINGS_PATH);
}

// For this homemade CLI, telemetry will only support 'local' (if enabled at all).
// The concept of a 'target' from settings or command line is less relevant if GCP is removed.
let target = 'local';
const targetArg = process.argv.find((arg) => arg.startsWith('--target='));

if (targetArg) {
  const potentialTarget = targetArg.split('=')[1];
  if (potentialTarget !== 'local') {
    console.warn(
      `⚠️ Warning: Command-line target '${potentialTarget}' is not supported. Telemetry will use 'local' if enabled.`,
    );
  }
  // No need to set target from arg if only 'local' is relevant
} else if (settingsTarget && settingsTarget !== 'local') {
   // Warning already printed by loadSettingsValue if settings had non-local target
}


// Always point to local_telemetry.js, as gcp script is removed.
const scriptPath = join(projectRoot, 'scripts', 'local_telemetry.js');

try {
  // The telemetry system itself (sdk.ts) checks if telemetry is enabled in config.
  // This script just runs the local collector setup.
  console.log(`🚀 Preparing local telemetry collector (if telemetry is enabled in settings)...`);
  execSync(`node ${scriptPath}`, { stdio: 'inherit', cwd: projectRoot });
} catch (error) {
  console.error(`🛑 Failed to run local telemetry setup script.`);
  console.error(error);
  process.exit(1); // Exit if the setup script itself fails.
}
