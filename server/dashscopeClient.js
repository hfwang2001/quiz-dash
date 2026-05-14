function extractJsonObject(content) {
  let text = `${content || ''}`.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Model did not return a JSON object: ${content}`);
  }

  return JSON.parse(text.slice(start, end + 1));
}

export class DashScopeClient {
  constructor(settings) {
    this.settings = settings;
  }

  async chatJson({ systemPrompt, userPrompt, temperature = 0.6, maxTokens = 1800 }) {
    const response = await fetch(`${this.settings.textBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.settings.apiKey}`,
        'User-Agent': 'quizdash/1.0'
      },
      body: JSON.stringify({
        model: this.settings.textModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        max_tokens: maxTokens
      })
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`DashScope request failed (${response.status}): ${rawText}`);
    }

    const data = JSON.parse(rawText);
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`Unexpected DashScope response: ${rawText}`);
    }

    return extractJsonObject(content);
  }

  async generateImage({ prompt, size = '512*512', promptExtend = false }) {
    const response = await fetch(this.settings.imageBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.settings.apiKey}`,
        'User-Agent': 'quizdash/1.0'
      },
      body: JSON.stringify({
        model: this.settings.imageModel,
        input: {
          messages: [
            {
              role: 'user',
              content: [{ text: prompt }]
            }
          ]
        },
        parameters: {
          size,
          prompt_extend: promptExtend
        }
      })
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`DashScope image request failed (${response.status}): ${rawText}`);
    }

    const data = JSON.parse(rawText);
    if (data?.code && !data?.output) {
      throw new Error(`${data.code}: ${data.message || 'Image generation failed.'}`);
    }
    return data;
  }

  async downloadFile(url, destinationPath) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'quizdash/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download generated image (${response.status}).`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const { mkdir, writeFile } = await import('node:fs/promises');
    const path = await import('node:path');
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, Buffer.from(arrayBuffer));
  }
}
