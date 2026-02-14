import type { AIChatRequest } from 'shared/src/types';

const API_KEY = () => process.env.GEMINI_API_KEY || '';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash';

const SYSTEM_PROMPT = `あなたはブレインストーミングのアシスタントです。ユーザーのアイデアを深掘りし、新しい視点や関連するアイデアを提案します。

回答のルール:
- 簡潔で具体的な回答を心がけてください
- 新しいアイデアを提案する場合は、箇条書きで明確に区切ってください
- ユーザーが「深掘り」を求めた場合は、そのアイデアの詳細な側面を探ってください
- 「関連提案」を求められた場合は、3〜5個の関連アイデアを提案してください
- 「批評」を求められた場合は、メリット・デメリット・改善案を述べてください`;

export async function* streamChat(req: AIChatRequest): AsyncGenerator<string> {
  const contextInfo = buildContext(req.context);

  const contents = [
    ...req.history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    {
      role: 'user',
      parts: [{ text: `${contextInfo}\n\n${req.message}` }],
    },
  ];

  const url = `${BASE_URL}:streamGenerateContent?alt=sse&key=${API_KEY()}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { maxOutputTokens: 1024 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const reader = res.body as any;
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of reader) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch {}
    }
  }
}

function buildContext(ctx: AIChatRequest['context']): string {
  let info = `[現在のアイデア: "${ctx.label}"]`;
  if (ctx.description) info += `\n[説明: ${ctx.description}]`;
  if (ctx.parentLabel) info += `\n[親アイデア: ${ctx.parentLabel}]`;
  if (ctx.siblingLabels?.length) info += `\n[兄弟アイデア: ${ctx.siblingLabels.join(', ')}]`;
  return info;
}
