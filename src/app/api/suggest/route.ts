import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const systemPrompt = buildSystemPrompt(libraries as LibraryContext[]);

    let userMessage = "";

    // Add reference samples from libraries
    const referenceSamples = (libraries as LibraryContext[])
      .filter((l) => l.referenceSamples?.trim())
      .map((l) => `Examples from "${l.name}" style:\n${l.referenceSamples.trim()}`);

    if (referenceSamples.length > 0) {
      userMessage += `Reference writing samples (match this voice and style):\n\n${referenceSamples.join("\n\n---\n\n")}\n\n---\n\n`;
    }

    userMessage += `Here is the full document for context:\n\n---\n${fullDocument}\n---\n\n`;

    const instruction =
      instructions?.trim() || "Improve clarity, grammar, and flow";

    userMessage += `Please improve this selected passage. Instruction: ${instruction}\n\n${selectedText}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json(
        { error: "Unexpected response type" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      original: selectedText,
      suggested: content.text,
    });
  } catch (error) {
    console.error("Suggestion API error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}
