import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });
  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type");
  }
  return content.text;
}

export async function POST(request: NextRequest) {
  try {
    const { libraryName, exampleFiles } = await request.json();

    if (!exampleFiles || exampleFiles.length === 0) {
      return NextResponse.json(
        { error: "No example files provided" },
        { status: 400 }
      );
    }

    const systemPrompt = `You are analyzing a collection of writing samples to create a concise style profile. Your output will be used as a system prompt to guide an AI writing assistant to match this author's voice.

Generate a "General Overview" that captures:
- Overall tone and voice (formal, casual, witty, etc.)
- Sentence structure patterns (short and punchy, long and flowing, mixed)
- Common rhetorical devices or techniques
- Vocabulary level and preferences
- How they open and close pieces
- Any distinctive habits or signatures in their writing
- Rules the AI should follow when writing in this style

Be specific and actionable. Write in second person ("You should...", "Use..."). Keep it under 300 words.`;

    const samplesText = exampleFiles
      .map(
        (f: { name: string; content: string }, i: number) =>
          `--- Example ${i + 1}: "${f.name}" ---\n${f.content}`
      )
      .join("\n\n");

    const userMessage = `Here are writing samples from the "${libraryName}" library. Analyze them and generate a style overview.\n\n${samplesText}`;

    const apiKey =
      process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_BACKUP_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "No API key configured" },
        { status: 500 }
      );
    }

    const overview = await callAnthropic(apiKey, systemPrompt, userMessage);

    return NextResponse.json({ overview });
  } catch (error) {
    console.error("Overview generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate overview" },
      { status: 500 }
    );
  }
}
