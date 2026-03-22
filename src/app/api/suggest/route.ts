import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a writing assistant that improves text. You will receive:
1. The full document for context
2. A specific selected passage to improve

Your job is to return ONLY the improved version of the selected passage. No explanations, no preamble, no quotes around the text. Just the improved text itself.

Focus on:
- Clarity and readability
- Grammar and punctuation
- Natural flow and rhythm
- Preserving the author's voice and intent

Do NOT:
- Change the meaning or tone dramatically
- Add new information the author didn't include
- Wrap your response in quotes or markdown
- Include any explanation of your changes`;

export async function POST(request: NextRequest) {
  try {
    const { selectedText, fullDocument } = await request.json();

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

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is the full document for context:\n\n---\n${fullDocument}\n---\n\nPlease improve this selected passage:\n\n${selectedText}`,
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
