export interface DocumentContext {
  styleGuide: string;
  referenceNotes: string;
  instructions: string;
}

const CONTEXT_KEY_PREFIX = "thinking-space-context-";

export function loadDocumentContext(docId: string): DocumentContext {
  if (typeof window === "undefined") return defaultContext();
  try {
    const raw = localStorage.getItem(CONTEXT_KEY_PREFIX + docId);
    if (!raw) return defaultContext();
    return { ...defaultContext(), ...JSON.parse(raw) };
  } catch {
    return defaultContext();
  }
}

export function saveDocumentContext(docId: string, context: DocumentContext): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONTEXT_KEY_PREFIX + docId, JSON.stringify(context));
}

function defaultContext(): DocumentContext {
  return {
    styleGuide: "",
    referenceNotes: "",
    instructions: "",
  };
}

/**
 * Rough token count estimate (~4 chars per token for English text).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
