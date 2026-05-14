import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TEXT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_TEXT_MODEL = 'qwen-turbo';
const DEFAULT_IMAGE_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const DEFAULT_IMAGE_MODEL = 'z-image-turbo';

function loadDotenvFile(filePath, target) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;

    const separatorIndex = line.indexOf('=');
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in target)) {
      target[key] = value;
    }
  }
}

export function loadSettings(rootDir, mode = 'development') {
  const mergedEnv = { ...process.env };
  const dotenvCandidates = [
    path.join(rootDir, '.env'),
    path.join(rootDir, `.env.${mode}`),
    path.join(rootDir, 'literacy_game', '.env'),
    path.join(rootDir, '..', 'literacy_game', '.env')
  ];

  for (const candidate of dotenvCandidates) {
    loadDotenvFile(candidate, mergedEnv);
  }

  const apiKey = `${mergedEnv.DASHSCOPE_API_KEY || ''}`.trim();
  if (!apiKey) {
    throw new Error('Missing DASHSCOPE_API_KEY. Reuse the literacy_game .env or add one in this project root.');
  }

  return {
    apiKey,
    textBaseUrl: `${mergedEnv.DASHSCOPE_TEXT_BASE_URL || DEFAULT_TEXT_BASE_URL}`.trim().replace(/\/$/, ''),
    textModel: `${mergedEnv.DASHSCOPE_TEXT_MODEL || DEFAULT_TEXT_MODEL}`.trim(),
    imageBaseUrl: `${mergedEnv.DASHSCOPE_IMAGE_BASE_URL || DEFAULT_IMAGE_BASE_URL}`.trim(),
    imageModel: `${mergedEnv.DASHSCOPE_IMAGE_MODEL || DEFAULT_IMAGE_MODEL}`.trim()
  };
}
