export interface Document {
  id: string;
  title: string;
  content: string;
  libraryIds: string[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "thinking-space-documents";

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export function createDocument(): Document {
  return {
    id: generateId(),
    title: "",
    content: "",
    libraryIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function loadDocuments(): Document[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const docs = JSON.parse(raw) as Document[];
    return docs.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveDocuments(documents: Document[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
}
