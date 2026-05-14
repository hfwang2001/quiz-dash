import { DashScopeClient } from './dashscopeClient.js';
import { loadSettings } from './config.js';
import { planQuizQuestions } from './questionPlanner.js';
import { createQuizImageSession, getQuizImageSessionSnapshot, resolveGeneratedAssetPath } from './quizImageSessionStore.js';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body is too large.'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

async function handleGenerateQuestions(req, res, rootDir, mode) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const selectedCategories = Array.isArray(body?.categories)
      ? body.categories.map((item) => `${item || ''}`.trim()).filter(Boolean).slice(0, 3)
      : [];
    const questionCount = Number.isInteger(body?.questionCount) ? Math.min(Math.max(body.questionCount, 1), 12) : 8;

    if (!selectedCategories.length) {
      sendJson(res, 400, { error: 'At least one category is required.' });
      return;
    }

    const settings = loadSettings(rootDir, mode);
    const client = new DashScopeClient(settings);
    const plan = await planQuizQuestions({ client, selectedCategories, questionCount });
    const imageSession = createQuizImageSession({
      rootDir,
      questions: plan.questions,
      client
    });

    sendJson(res, 200, {
      ...plan,
      imageSession
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Failed to generate quiz questions.'
    });
  }
}

function handleImageSessionStatus(req, res) {
  const requestUrl = new URL(req.url, 'http://127.0.0.1');
  const sessionId = requestUrl.searchParams.get('sessionId') || '';
  if (!sessionId) {
    sendJson(res, 400, { error: 'Missing sessionId.' });
    return;
  }

  const snapshot = getQuizImageSessionSnapshot(sessionId);
  if (!snapshot) {
    sendJson(res, 404, { error: 'Image session not found.' });
    return;
  }

  sendJson(res, 200, snapshot);
}

function handleGeneratedAsset(req, res, rootDir) {
  const filePath = resolveGeneratedAssetPath(rootDir, req.url || '');
  if (!filePath) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const normalizedRoot = path.join(rootDir, '.quizdash-generated');
  const normalizedPath = path.normalize(filePath);
  if (!normalizedPath.startsWith(normalizedRoot) || !fs.existsSync(normalizedPath)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/png');
  fs.createReadStream(normalizedPath).pipe(res);
}

export function quizApiPlugin() {
  return {
    name: 'quizdash-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url || '').startsWith('/api/questions/generate')) {
          handleGenerateQuestions(req, res, server.config.root, server.config.mode);
          return;
        }
        if ((req.url || '').startsWith('/api/questions/assets/status')) {
          handleImageSessionStatus(req, res);
          return;
        }
        if ((req.url || '').startsWith('/generated/quiz-assets/')) {
          handleGeneratedAsset(req, res, server.config.root);
          return;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url || '').startsWith('/api/questions/generate')) {
          handleGenerateQuestions(req, res, server.config.root, server.config.mode);
          return;
        }
        if ((req.url || '').startsWith('/api/questions/assets/status')) {
          handleImageSessionStatus(req, res);
          return;
        }
        if ((req.url || '').startsWith('/generated/quiz-assets/')) {
          handleGeneratedAsset(req, res, server.config.root);
          return;
        }
        next();
      });
    }
  };
}
