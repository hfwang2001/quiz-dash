import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { buildOptionImagePrompt } from './imagePromptBuilder.js';
import { whiteToTransparent } from './transparency.js';

const SESSION_PREFIX = '/generated/quiz-assets/';
const sessions = new Map();

function makeAssetKey(questionId, side) {
  return `${questionId}:${side}`;
}

function makeInitialAssetState(subject) {
  return {
    subject,
    status: 'pending',
    imageUrl: '',
    error: ''
  };
}

function buildAssetSnapshot(question, assetsByOption) {
  return {
    id: question.id,
    left: assetsByOption[makeAssetKey(question.id, 'left')],
    right: assetsByOption[makeAssetKey(question.id, 'right')]
  };
}

function publicPathFor(sessionId, fileName) {
  return `${SESSION_PREFIX}${sessionId}/${fileName}`;
}

export function createQuizImageSession({ rootDir, questions, client }) {
  const sessionId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const assetDir = path.join(rootDir, '.quizdash-generated', sessionId);
  fs.mkdirSync(assetDir, { recursive: true });

  const assetsByOption = {};
  for (const question of questions) {
    assetsByOption[makeAssetKey(question.id, 'left')] = makeInitialAssetState(question.options[0]);
    assetsByOption[makeAssetKey(question.id, 'right')] = makeInitialAssetState(question.options[1]);
  }

  const session = {
    id: sessionId,
    questions,
    assetDir,
    client,
    status: 'queued',
    currentQuestionId: null,
    completedQuestions: 0,
    assetsByOption,
    startedAt: null,
    finishedAt: null
  };

  sessions.set(sessionId, session);
  queueMicrotask(() => {
    void generateSessionImages(session).catch((error) => {
      session.status = 'failed';
      session.finishedAt = new Date().toISOString();
      const fallbackMessage = error instanceof Error ? error.message : 'Image generation failed.';
      for (const question of session.questions) {
        for (const side of ['left', 'right']) {
          const asset = session.assetsByOption[makeAssetKey(question.id, side)];
          if (asset.status === 'pending' || asset.status === 'generating') {
            asset.status = 'error';
            asset.error = fallbackMessage;
          }
        }
      }
    });
  });

  return getQuizImageSessionSnapshot(sessionId);
}

export function getQuizImageSessionSnapshot(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  return {
    sessionId: session.id,
    status: session.status,
    currentQuestionId: session.currentQuestionId,
    completedQuestions: session.completedQuestions,
    totalQuestions: session.questions.length,
    questions: session.questions.map((question) => buildAssetSnapshot(question, session.assetsByOption))
  };
}

export function resolveGeneratedAssetPath(rootDir, requestPath) {
  if (!requestPath.startsWith(SESSION_PREFIX)) return null;
  const relativePath = requestPath.slice(SESSION_PREFIX.length);
  const safeRelativePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  return path.join(rootDir, '.quizdash-generated', safeRelativePath);
}

async function generateSessionImages(session) {
  session.status = 'running';
  session.startedAt = new Date().toISOString();

  for (const question of session.questions) {
    session.currentQuestionId = question.id;
    await generateQuestionOptionImage(session, question, 'left', question.options[0]);
    await generateQuestionOptionImage(session, question, 'right', question.options[1]);
    session.completedQuestions += 1;
  }

  session.currentQuestionId = null;
  session.status = 'completed';
  session.finishedAt = new Date().toISOString();
}

async function generateQuestionOptionImage(session, question, side, subject) {
  const assetState = session.assetsByOption[makeAssetKey(question.id, side)];
  assetState.status = 'generating';
  assetState.error = '';

  try {
    const promptPayload = buildOptionImagePrompt(subject);
    const finalPrompt = `${promptPayload.positivePrompt} Avoid: ${promptPayload.negativePromptHint}.`.slice(0, 790);
    const response = await session.client.generateImage({
      prompt: finalPrompt,
      size: promptPayload.recommendedSize
    });
    const content = response?.output?.choices?.[0]?.message?.content || [];
    const remoteUrl = content.find((item) => item?.image)?.image;
    if (!remoteUrl) {
      throw new Error(`Image API did not return an image for "${subject}".`);
    }

    const sourceFile = path.join(session.assetDir, `q${question.id}-${side}.source`);
    const transparentFile = path.join(session.assetDir, `q${question.id}-${side}.png`);
    await session.client.downloadFile(remoteUrl, sourceFile);
    await whiteToTransparent(sourceFile, transparentFile);

    assetState.status = 'ready';
    assetState.imageUrl = publicPathFor(session.id, path.basename(transparentFile));
  } catch (error) {
    assetState.status = 'error';
    assetState.error = error instanceof Error ? error.message : 'Image generation failed.';
  }
}
