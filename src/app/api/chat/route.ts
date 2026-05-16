import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

interface LibraryContext {
  name: string;
  styleRules: string;
  referenceSamples: string;
  vocabulary: string;
  structureNotes: string;
  generatedOverview?: string;
  exampleFiles?: { name: string; content: string }[];
  feedback?: { aiSuggested: string; userEdited: string }[];
}

function buildDiagnosePrompt(
  selectedText: string,
  fullDocument: string,
  libraries: LibraryContext[],
  chatMode: string = "improve"
): { system: string; user: string } {
  let system: string;

  if (chatMode === "transition") {
    system = `You are a writing coach. The author has selected text spanning a transition point between two sections. Your job is to suggest 3-5 different transition approaches — each a distinct creative strategy for connecting these sections.

For each approach, provide:
- "title": A short name for the transition concept (2-5 words)
- "description": 1 sentence explaining the high-level idea
- "examples": An array of 1-2 concrete example sentences/phrases showing what this transition could actually look like in the author's text. These should be actual draft text the author could use, written in their voice.

Return a JSON array. Nothing else — just the JSON array.

Example format:
[
  {"title": "Callback bridge", "description": "Echo a phrase or idea from the previous section to create continuity.", "examples": ["That sense of gratitude stayed with me as I started thinking about what comes next.", "It was that same restlessness that led me to a bigger question."]},
  {"title": "Direct pivot", "description": "Acknowledge the shift explicitly and move forward.", "examples": ["But stepping back from the specifics, a bigger question was forming."]},
  {"title": "Thematic thread", "description": "Surface the underlying theme that connects both sections.", "examples": ["Every career move comes down to the same question: what kind of work do I want my life to be about?"]}
]`;
  } else {
    system = `You are a writing coach. Analyze the selected passage and identify 3-7 specific areas for improvement, categorized into three types:

- "general": Grammar, word choice, clarity, conciseness — specific line-level fixes
- "cleanup": Tone, voice, register, emotional resonance — higher-level polish
- "structural": Organization, flow, openings, transitions, emphasis — how the passage is built

Each area should be a concise observation (1-2 sentences max).

Return your response as a JSON array of objects with "category" ("general", "cleanup", or "structural"), "title" (2-4 words), and "description" (1-2 sentences explaining the issue). Nothing else — just the JSON array. Aim for a mix across categories.

Example format:
[
  {"category": "general", "title": "Vague phrasing", "description": "The phrase 'AI native' is jargon that doesn't clearly communicate what the team does."},
  {"category": "structural", "title": "Abrupt opening", "description": "The paragraph jumps straight into the news without connecting to the previous section. Leading with context would be stronger."},
  {"category": "cleanup", "title": "Inconsistent tone", "description": "The formal job title feels out of place in what reads as a personal reflection to your board."}
]`;
  }

  const styleRules = libraries.map((l) => l.styleRules?.trim()).filter(Boolean);
  if (styleRules.length > 0) {
    system += `\n\nThe author's style rules (consider these when diagnosing):\n${styleRules.join("\n\n")}`;
  }

  const overviews = libraries.map((l) => l.generatedOverview?.trim()).filter(Boolean);
  if (overviews.length > 0) {
    system += `\n\nStyle overview (captures the author's voice):\n${overviews.join("\n\n")}`;
  }

  const user = `Full document for context:\n"""\n${fullDocument}\n"""\n\nSelected passage to analyze:\n"""\n${selectedText}\n"""`;

  return { system, user };
}

function buildRewritePrompt(
  selectedText: string,
  fullDocument: string,
  improvements: string[],
  additionalContext: string,
  libraries: LibraryContext[]
): { system: string; user: string } {
  let system = `You are a writing assistant. Rewrite the selected passage incorporating the specific improvements listed below. Return ONLY the improved text — no explanations, no quotes, no preamble.

Do NOT:
- Change the meaning dramatically
- Add new information the author didn't include
- Wrap your response in quotes or markdown
- Include any explanation of your changes`;

  const styleRules = libraries.map((l) => l.styleRules?.trim()).filter(Boolean);
  if (styleRules.length > 0) {
    system += `\n\nThe author's style rules:\n${styleRules.join("\n\n")}`;
  }

  const overviews = libraries.map((l) => l.generatedOverview?.trim()).filter(Boolean);
  if (overviews.length > 0) {
    system += `\n\nStyle overview (captures the author's voice):\n${overviews.join("\n\n")}`;
  }

  let user = `Full document for context:\n"""\n${fullDocument}\n"""\n\nSelected passage to rewrite:\n"""\n${selectedText}\n"""\n\nImprovements to incorporate:\n`;
  improvements.forEach((imp, i) => {
    user += `${i + 1}. ${imp}\n`;
  });

  if (additionalContext.trim()) {
    user += `\nAdditional context from the author: ${additionalContext.trim()}`;
  }

  return { system, user };
}

async function callAnthropic(
  apiKey: string,
  system: string,
  userMessage: string
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const result = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userMessage }],
  });
  const content = result.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");
  return content.text;
}

async function callWithFallback(system: string, userMessage: string): Promise<string> {
  const providers: { name: string; fn: () => Promise<string>; available: boolean }[] = [
    {
      name: "Anthropic",
      fn: () => callAnthropic(process.env.ANTHROPIC_API_KEY!, system, userMessage),
      available: !!process.env.ANTHROPIC_API_KEY,
    },
    {
      name: "Anthropic (backup)",
      fn: () => callAnthropic(process.env.ANTHROPIC_BACKUP_API_KEY!, system, userMessage),
      available: !!process.env.ANTHROPIC_BACKUP_API_KEY,
    },
  ];

  const available = providers.filter((p) => p.available);
  if (available.length === 0) throw new Error("No API keys configured. Set ANTHROPIC_API_KEY.");

  let lastError: Error | null = null;
  for (const provider of available) {
    try {
      return await provider.fn();
    } catch (error) {
      console.error(`${provider.name} failed:`, (error as Error).message);
      lastError = error as Error;
    }
  }
  throw lastError || new Error("All providers failed");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mode, chatMode, selectedText, fullDocument, libraries = [] } = body;

    if (!selectedText) {
      return NextResponse.json({ error: "No text selected" }, { status: 400 });
    }

    if (mode === "diagnose") {
      const { system, user } = buildDiagnosePrompt(selectedText, fullDocument, libraries, chatMode);
      const text = await callWithFallback(system, user);

      try {
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        const improvements = JSON.parse(jsonMatch ? jsonMatch[0] : text);
        return NextResponse.json({ improvements });
      } catch {
        return NextResponse.json({
          improvements: [{ title: "General", description: text }],
        });
      }
    }

    if (mode === "rewrite") {
      const { improvements, additionalContext = "" } = body;
      const { system, user } = buildRewritePrompt(
        selectedText,
        fullDocument,
        improvements,
        additionalContext,
        libraries
      );
      const text = await callWithFallback(system, user);
      return NextResponse.json({ rewrite: text });
    }

    if (mode === "transition-rewrite") {
      const { approaches = [], comment = "" } = body;

      let system = `You are a writing assistant. The author selected text spanning a transition point between two sections. Based on the transition approaches and examples they liked, write ONLY the bridging/transition text that goes between the two sections.

CRITICAL RULES:
- Do NOT rewrite the surrounding paragraphs. Only output the transition itself — the sentence(s) or short paragraph that bridges the two sections.
- Preserve the author's formatting: use line breaks between paragraphs (separate paragraphs with blank lines).
- If the original has a break marker like "—" or "---", you may replace it with your transition or keep it — use your judgment.
- Write in the author's voice. No explanations, no quotes, no preamble — just the transition text.
- The transition should be concise — typically 1-3 sentences.`;

      const styleRules = (libraries as LibraryContext[]).map((l) => l.styleRules?.trim()).filter(Boolean);
      if (styleRules.length > 0) {
        system += `\n\nThe author's style rules:\n${styleRules.join("\n\n")}`;
      }

      let user = `Full document for context:\n"""\n${fullDocument}\n"""\n\nSelected passage (contains the transition point):\n"""\n${selectedText}\n"""\n\nTransition approaches the author liked:\n`;
      approaches.forEach((a: { title: string; description: string; examples: string[] }, i: number) => {
        user += `\n${i + 1}. "${a.title}" — ${a.description}\n`;
        a.examples?.forEach((ex: string) => {
          user += `   Example: "${ex}"\n`;
        });
      });

      if (comment.trim()) {
        user += `\nAuthor's note: ${comment.trim()}`;
      }

      const text = await callWithFallback(system, user);
      return NextResponse.json({ rewrite: text });
    }

    if (mode === "chat") {
      const { message = "" } = body;
      if (!message.trim()) {
        return NextResponse.json({ error: "No message provided" }, { status: 400 });
      }

      let system = `You are a thoughtful writing advisor. The author has selected a passage from their document and wants to discuss it with you. Answer their question directly and helpfully. Be concise but thorough. Write in plain text — no markdown headers or bullet formatting unless the author's question clearly calls for a list.`;

      const styleRules = (libraries as LibraryContext[]).map((l) => l.styleRules?.trim()).filter(Boolean);
      if (styleRules.length > 0) {
        system += `\n\nThe author's style rules (for context):\n${styleRules.join("\n\n")}`;
      }

      const overviews = (libraries as LibraryContext[]).map((l) => l.generatedOverview?.trim()).filter(Boolean);
      if (overviews.length > 0) {
        system += `\n\nStyle overview:\n${overviews.join("\n\n")}`;
      }

      const user = `Full document for context:\n"""\n${fullDocument}\n"""\n\nSelected passage:\n"""\n${selectedText}\n"""\n\nAuthor's question: ${message}`;

      const text = await callWithFallback(system, user);
      return NextResponse.json({ response: text });
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to generate response" },
      { status: 500 }
    );
  }
}
