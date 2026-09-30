import Groq from 'groq-sdk';
import { env } from '../config/env';

/**
 * Provider-agnostic AI surface. The socket handler talks only to the functions
 * in this file, so the underlying provider can be swapped without touching any
 * connection logic.
 */

export type AiMode = 'explain' | 'review' | 'refactor';

export interface AiChange {
  startLine: number;
  endLine: number;
  replacement: string;
}

export interface AiSuggestion {
  explanation: string;
  changes: AiChange[];
}

const MODEL = 'openai/gpt-oss-120b';

let client: Groq | null = null;

const getClient = (): Groq => {
  if (!env.groqApiKey) {
    throw new Error('The AI service is not configured (missing GROQ_API_KEY).');
  }
  if (!client) client = new Groq({ apiKey: env.groqApiKey });
  return client;
};

const systemPrompt = (mode: AiMode): string => {
  const base =
    'You are CodeSync Assistant, an expert pair programmer embedded in a real-time collaborative code editor. ' +
    'You are given a structured, tree-sitter-derived view of the file the user is working on. ' +
    'Be concise, concrete, and technically precise. Never invent APIs or facts about the code.';

  switch (mode) {
    case 'explain':
      return (
        base +
        ' Explain the selected code (or the file structure if nothing is selected) in clear, well-structured markdown. ' +
        'Cover purpose, inputs/outputs, control flow, and any non-obvious behaviour. Keep it under ~400 words.'
      );
    case 'review':
      return (
        base +
        ' Review the code for correctness, bugs, security issues, readability, and performance. ' +
        'Report concrete findings as a short prioritised list, each with the specific problem and suggested fix. ' +
        'Skip praise unless it is genuinely notable.'
      );
    case 'refactor':
      return (
        base +
        ' First, briefly explain (2-4 sentences) what you will refactor and why. Then a separate system step ' +
        'produces the machine-readable diff. Do not paste code blocks in this explanation.'
      );
  }
};

const buildMessages = (context: string, mode: AiMode) => [
  { role: 'system' as const, content: systemPrompt(mode) },
  {
    role: 'user' as const,
    content: `Here is the current code context:\n\n${context}\n\n${
      mode === 'explain'
        ? 'Explain this code.'
        : mode === 'review'
        ? 'Review this code.'
        : 'Refactor this code for clarity and correctness, preserving behaviour.'
    }`,
  },
];

/**
 * Streams a plain-text response token by token. `onToken` is invoked for every
 * delta, so callers can relay them live to every client in the room.
 * Returns the full concatenated text.
 */
export const generateStreamingReview = async (
  context: string,
  mode: AiMode,
  onToken: (token: string) => void
): Promise<string> => {
  const groq = getClient();

  const stream = await groq.chat.completions.create({
    model: MODEL,
    messages: buildMessages(context, mode),
    stream: true,
    temperature: 0.3,
  });

  let fullText = '';
  for await (const chunk of stream) {
    const token = chunk.choices?.[0]?.delta?.content ?? '';
    if (token) {
      fullText += token;
      onToken(token);
    }
  }

  return fullText;
};

/**
 * Second pass for refactor mode: requests strict JSON output describing
 * line-range replacements. Line numbers are 1-based and inclusive and refer to
 * the exact file content that was passed as context.
 */
export const generateRefactorJSON = async (context: string): Promise<AiSuggestion> => {
  const groq = getClient();

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are CodeSync Assistant. You output ONLY valid JSON — no markdown, no commentary. ' +
          'The JSON must have the shape: ' +
          '{"explanation": string, "changes": [{"startLine": number, "endLine": number, "replacement": string}]}. ' +
          'startLine and endLine are 1-based and inclusive and MUST refer to the line numbers in the file given to you. ' +
          'Apply changes from the top of the file downward; each replacement replaces the FULL text of those lines. ' +
          'If the code already good, return an empty changes array.',
      },
      {
        role: 'user',
        content: `Refactor this file for clarity and correctness, preserving behaviour.\n\n${context}`,
      },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices?.[0]?.message?.content ?? '{}';

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('The AI returned a malformed refactor response. Please try again.');
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const rawChanges = Array.isArray(obj.changes) ? obj.changes : [];

  const changes: AiChange[] = rawChanges
    .map((change) => {
      const c = (change ?? {}) as Record<string, unknown>;
      const startLine = Number(c.startLine);
      const endLine = Number(c.endLine);
      const replacement = String(c.replacement ?? '');
      if (!Number.isFinite(startLine) || !Number.isFinite(endLine) || startLine < 1) return null;
      return {
        startLine: Math.floor(startLine),
        endLine: Math.floor(Math.max(endLine, startLine)),
        replacement,
      };
    })
    .filter((change): change is AiChange => change !== null);

  return {
    explanation: String(obj.explanation ?? ''),
    changes,
  };
};
