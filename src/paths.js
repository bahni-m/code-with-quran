'use strict';

const os = require('os');
const path = require('path');

/**
 * Root directory for waitwithayat's own files.
 * Override with WAITWITHAYAT_HOME (used by tests).
 */
function homeDir() {
  return process.env.WAITWITHAYAT_HOME || path.join(os.homedir(), '.waitwithayat');
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
