const PLANNER_SYSTEM_PROMPT = `# Role: 儿童问答游戏题目策划专家

# Workflow:
1. **题型读取**：读取用户选定的题目类型，明确本轮要覆盖的知识主题。
2. **年龄对齐**：将难度严格压到 3-6 岁儿童可理解的水平，优先选择日常生活中常见、直观、可想象的知识点。
3. **题目生成**：围绕所选题型生成二选一问答题，每题只有一个明确正确答案。
4. **儿童化检查**：检查题干是否短、口语化、无抽象术语；检查错误选项是否看起来合理但不会误导到危险或成人内容。
5. **结构化输出**：把题目整理为稳定 JSON，便于前端直接读取和渲染。

# Constraints:
1. **输出格式**：仅输出紧凑 JSON，不含解释、不含 Markdown、不含代码块。
2. **语言要求**：全部使用简体中文，适合 3-6 岁儿童听懂。
3. **题目形式**：每题必须包含 category、prompt、options、correct 四个核心字段。
4. **选项约束**：options 必须恰好有 2 个字符串；两个选项不能重复，且都要简短。
5. **答案约束**：correct 只能是 left 或 right。
6. **安全边界**：不能出现暴力、恐怖、成人、医疗建议、危险行为或让儿童模仿的风险内容。
7. **知识边界**：问题要具体、单一、可判断，不能依赖冷门事实、年份细节、复杂计算或阅读长句。
8. **分布要求**：尽量让题目覆盖用户选中的多个题型，分布尽量均衡。
9. **可生图要求**：两个选项尽量使用可直接画出来的具体名词或短名词短语，例如动物、食物、工具、颜色物体、自然物体、国家符号或身体部位。避免抽象概念、动作、整句描述和复杂场景。
10. **必要改写**：如果原本知识点不适合用名词表达，必须先把题目改写成“看图可判断”的形式，再输出。

# Output Schema:
- title: 本轮题集标题
- age_band: 固定写成适合的年龄段
- questions: 题目数组
  - id: 从 1 开始的整数
  - category: 中文题型名
  - prompt: 题目内容
  - options: 两个选项，按左右顺序排列
  - correct: left 或 right

# Output Example:
{
  "title": "动物与食物问答",
  "age_band": "3-6岁",
  "questions": [
    {
      "id": 1,
      "category": "动物",
      "prompt": "哪一种动物会喵喵叫？",
      "options": ["小猫", "小鱼"],
      "correct": "left"
    }
  ]
}`;

function normalizeText(value, fallback, maxLength = 36) {
  const text = `${value || ''}`.replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, maxLength);
}

function normalizeOption(value) {
  return normalizeText(value, '', 18);
}

function normalizeQuestions(rawQuestions, selectedCategories, questionCount) {
  const questions = [];
  const seenPrompts = new Set();

  for (const rawQuestion of Array.isArray(rawQuestions) ? rawQuestions : []) {
    const prompt = normalizeText(rawQuestion?.prompt, '', 44);
    const rawOptions = Array.isArray(rawQuestion?.options) ? rawQuestion.options.slice(0, 2) : [];
    const options = rawOptions.map(normalizeOption).filter(Boolean);
    const correct = rawQuestion?.correct === 'right' ? 'right' : rawQuestion?.correct === 'left' ? 'left' : '';
    const category = selectedCategories.includes(rawQuestion?.category)
      ? rawQuestion.category
      : selectedCategories[questions.length % selectedCategories.length];

    if (!prompt || seenPrompts.has(prompt) || options.length !== 2 || options[0] === options[1]) {
      continue;
    }
    if (!correct) continue;

    seenPrompts.add(prompt);
    questions.push({
      id: questions.length + 1,
      category,
      prompt,
      options,
      correct
    });

    if (questions.length >= questionCount) break;
  }

  if (questions.length < questionCount) {
    throw new Error(`Model returned only ${questions.length} usable questions, expected ${questionCount}.`);
  }

  return questions;
}

export async function planQuizQuestions({ client, selectedCategories, questionCount }) {
  const userPrompt = [
    `请为体感问答游戏生成 ${questionCount} 道题。`,
    `用户选中的题目类型：${selectedCategories.join('、')}`,
    '题目难度必须适合 3-6 岁儿童。',
    '请尽量平均覆盖这些题型。',
    '每题都必须是二选一，答案明确，选项简短，适合在大屏上展示。',
    '不要生成需要识字太多、复杂逻辑推理、年份细节、抽象文化背景或专业术语的内容。',
    '两个选项尽量使用可以直接生成图片的具体名词，不要用动作、句子或抽象表达。'
  ].join('\n');

  const raw = await client.chatJson({
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.7,
    maxTokens: 2200
  });

  return {
    title: normalizeText(raw?.title, `${selectedCategories.join(' / ')} 题目`, 28),
    ageBand: normalizeText(raw?.age_band, '3-6岁', 10),
    questions: normalizeQuestions(raw?.questions, selectedCategories, questionCount)
  };
}
