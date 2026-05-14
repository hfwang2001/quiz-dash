export async function generateQuizQuestions({ categories, questionCount }) {
  const response = await fetch('/api/questions/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      categories,
      questionCount
    })
  });

  const rawText = await response.text();
  const payload = rawText ? tryParseJson(rawText) : null;

  if (!rawText) {
    throw new Error('题目生成接口没有返回内容。请先重启 `npm run dev`，确保新的本地 API 已加载。');
  }

  if (!payload) {
    throw new Error(`题目生成接口返回的不是合法 JSON：${rawText.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw new Error(payload?.error || '题目生成失败，请稍后再试。');
  }

  return payload;
}

export async function fetchQuestionImageSession(sessionId) {
  const response = await fetch(`/api/questions/assets/status?sessionId=${encodeURIComponent(sessionId)}`);
  const rawText = await response.text();
  const payload = rawText ? tryParseJson(rawText) : null;

  if (!rawText) {
    throw new Error('题目图片状态接口没有返回内容。');
  }

  if (!payload) {
    throw new Error(`题目图片状态接口返回的不是合法 JSON：${rawText.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw new Error(payload?.error || '获取题目图片状态失败。');
  }

  return payload;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
