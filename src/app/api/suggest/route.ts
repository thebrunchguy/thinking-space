import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

interface LibraryContext {
  name: string;
  styleRules: string;
  referenceSamples: string;
  vocabulary: string;
  structureNotes: string;
}

const BASE_SYSTEM_PROMPT = `You are a writing assistant that improves text. You will receive:
1. The full document for context
2. A specific selected passage to improve

Your job is to return ONLY the improved version of the selected passage. No explanations, no preamble, no quotes around the text. Just the improved text itself.

Do NOT:
- Change the meaning or tone dramatically
- Add new information the author didn't include
- Wrap your response in quotes or markdown
- Include any explanation of your changes`;

function buildSystemPrompt(libraries: LibraryContext[]): string {
  let prompt = BASE_SYSTEM_PROMPT;

  const styleRules = libraries
    .map((l) => l.styleRules?.trim())
    .filter(Boolean);
  const vocabulary = libraries
    .map((l) => l.vocabulary?.trim())
    .filter(Boolean);
  const structureNotes = libraries
    .map((l) => l.structureNotes?.trim())
    .filter(Boolean);

  if (styleRules.length > 0) {
    prompt += `\n\nThe author's style rules (follow these closely):\n${styleRules.join("\n\n")}`;
  }

  if (vocabulary.length > 0) {
    prompt += `\n\nVocabulary preferences:\n${vocabulary.join("\n\n")}`;
  }

  if (structureNotes.length > 0) {
    prompt += `\n\nStructure guidelines:\n${structureNotes.join("\n\n")}`;
  }

  if (styleRules.length === 0 && vocabulary.length === 0 && structureNotes.length === 0) {
    prompt += `\n\nFocus on:
- Clarity and readability
- Grammar and punctuation
- Natural flow and rhythm
- Preserving the author's voice and intent`;
  }

  return prompt;
}

function buildUserMessage(
  selectedText: string,
  fullDocument: string,
  libraries: LibraryContext[],
  instructions?: string
): string {
  let userMessage = "";

  const referenceSamples = libraries
    .filter((l) => l.referenceSamples?.trim())
    .map((l) => `Examples from "${l.name}" style:\n${l.referenceSamples.trim()}`);

  if (referenceSamples.length > 0) {
    userMessage += `Reference writing samples (match this voice and style):\n\n${referenceSamples.join("\n\n---\n\n")}\n\n---\n\n`;
  }

  userMessage += `Here is the full document for context:\n\n---\n${fullDocument}\n---\n\n`;

  const instruction =
    instructions?.trim() || "Improve clarity, grammar, and flow";

  userMessage += `Please improve this selected passage. Instruction: ${instruction}\n\n${selectedText}`;

  return userMessage;
}

async function tryAnthropic(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Anthropic");
  }
  return content.text;
}

async function tryOpenAI(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) {
    throw new Error("Unexpected response from OpenAI");
  }
  return text;
}

async function tryBackupAnthropic(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_BACKUP_API_KEY,
  });

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Anthropic backup");
  }
  return content.text;
}

export async function POST(request: NextRequest) {
  try {
    const {
      selectedText,
      fullDocument,
      libraries = [],
      instructions,
    } = await request.json();

    if (!selectedText) {
      return NextResponse.json(
        { error: "No text selected" },
        { status: 400 }
      );
    }

    const systemPrompt = buildSystemPrompt(libraries as LibraryContext[]);
    const userMessage = buildUserMessage(
      selectedText,
      fullDocument,
      libraries as LibraryContext[],
      instructions
    );

    // Try providers in order: Anthropic → Backup Anthropic → OpenAI
    const providers: { name: string; fn: () => Promise<string>; available: boolean }[] = [
      {
        name: "Anthropic",
        fn: () => tryAnthropic(systemPrompt, userMessage),
        available: !!process.env.ANTHROPIC_API_KEY,
      },
      {
        name: "Anthropic (backup)",
        fn: () => tryBackupAnthropic(systemPrompt, userMessage),
        available: !!process.env.ANTHROPIC_BACKUP_API_KEY,
      },
      {
        name: "OpenAI",
        fn: () => tryOpenAI(systemPrompt, userMessage),
        available: !!process.env.OPENAI_API_KEY,
      },
    ];

    const availableProviders = providers.filter((p) => p.available);

    if (availableProviders.length === 0) {
      return NextResponse.json(
        { error: "No API keys configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY." },
        { status: 500 }
      );
    }

    let lastError: Error | null = null;

    for (const provider of availableProviders) {
      try {
        console.log(`Trying ${provider.name}...`);
        const text = await provider.fn();
        return NextResponse.json({
          original: selectedText,
          suggested: text,
        });
      } catch (error) {
        console.error(`${provider.name} failed:`, (error as Error).message);
        lastError = error as Error;
      }
    }

    return NextResponse.json(
      { error: `All providers failed. Last error: ${lastError?.message}` },
      { status: 500 }
    );
  } catch (error) {
    console.error("Suggestion API error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}
