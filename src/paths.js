'use strict';

const os = require('os');
const path = require('path');

/**
 * Root directory for code-with-quran's own files.
 * Override with CODE_WITH_QURAN_HOME (used by tests).
 */
function homeDir() {
  return (
    process.env.CODE_WITH_QURAN_HOME || path.join(os.homedir(), '.code-with-quran')
  );
}

function statePath() {
  return path.join(homeDir(), 'state.json');
}

function configPath() {
  return path.join(homeDir(), 'config.json');
}

/**
 * Claude Code settings file the hook is installed into.
 * @param {'global' | 'project'} scope
 */
function claudeSettingsPath(scope) {
  if (scope === 'project') {
    return path.join(process.cwd(), '.claude', 'settings.json');
  }
  return path.join(os.homedir(), '.claude', 'settings.json');
}

module.exports = { homeDir, statePath, configPath, claudeSettingsPath };
