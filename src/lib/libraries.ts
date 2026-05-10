export interface SuggestionFeedback {
  id: string;
  aiSuggested: string;
  userEdited: string;
  timestamp: number;
}

export interface ExampleFile {
  id: string;
  name: string;
  content: string;
  createdAt: number;
}

export interface Library {
  id: string;
  name: string;
  description: string;
  styleRules: string;
  referenceSamples: string;
  vocabulary: string;
  structureNotes: string;
  exampleFiles: ExampleFile[];
  generatedOverview: string;
  feedback: SuggestionFeedback[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "thinking-space-libraries";

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

const STARTER_LIBRARIES: Omit<Library, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Tweets",
    description: "Short-form social media posts",
    styleRules: "",
    referenceSamples: "",
    vocabulary: "",
    structureNotes: "",
    exampleFiles: [],
    generatedOverview: "",
    feedback: [],
  },
  {
    name: "Blog Posts",
    description: "Long-form blog content",
    styleRules: "",
    referenceSamples: "",
    vocabulary: "",
    structureNotes: "",
    exampleFiles: [],
    generatedOverview: "",
    feedback: [],
  },
  {
    name: "Newsletter",
    description: "Email newsletter writing",
    styleRules: "",
    referenceSamples: "",
    vocabulary: "",
    structureNotes: "",
    exampleFiles: [],
    generatedOverview: "",
    feedback: [],
  },
  {
    name: "Technical Writing",
    description: "Documentation and technical content",
    styleRules: "",
    referenceSamples: "",
    vocabulary: "",
    structureNotes: "",
    exampleFiles: [],
    generatedOverview: "",
    feedback: [],
  },
  {
    name: "Personal/Casual",
    description: "Informal, conversational writing",
    styleRules: "",
    referenceSamples: "",
    vocabulary: "",
    structureNotes: "",
    exampleFiles: [],
    generatedOverview: "",
    feedback: [],
  },
];

function seedLibraries(): Library[] {
  const now = Date.now();
  return STARTER_LIBRARIES.map((lib, i) => ({
    ...lib,
    id: generateId(),
    createdAt: now - i,
    updatedAt: now - i,
  }));
}

export function loadLibraries(): Library[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedLibraries();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as Library[];
    // Migrate older libraries missing new fields
    return parsed.map((lib) => ({
      ...lib,
      exampleFiles: lib.exampleFiles ?? [],
      generatedOverview: lib.generatedOverview ?? "",
      feedback: lib.feedback ?? [],
    }));
  } catch {
    return [];
  }
}

export function saveLibraries(libraries: Library[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(libraries));
}

export function createLibrary(name: string): Library {
  return {
    id: generateId(),
    name,
    description: "",
    styleRules: "",
    referenceSamples: "",
    vocabulary: "",
    structureNotes: "",
    exampleFiles: [],
    generatedOverview: "",
    feedback: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createExampleFile(name: string): ExampleFile {
  return {
    id: generateId(),
    name,
    content: "",
    createdAt: Date.now(),
  };
}

export function updateLibrary(
  libraries: Library[],
  id: string,
  updates: Partial<Omit<Library, "id" | "createdAt">>
): Library[] {
  return libraries.map((lib) =>
    lib.id === id ? { ...lib, ...updates, updatedAt: Date.now() } : lib
  );
}

export function deleteLibrary(libraries: Library[], id: string): Library[] {
  return libraries.filter((lib) => lib.id !== id);
}

export function getLibrariesById(
  libraries: Library[],
  ids: string[]
): Library[] {
  return ids.map((id) => libraries.find((l) => l.id === id)).filter(Boolean) as Library[];
}

// Per-document library selection
const DOC_LIBRARIES_KEY_PREFIX = "thinking-space-doc-libraries-";

export function loadDocumentLibraryIds(docId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DOC_LIBRARIES_KEY_PREFIX + docId);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function saveDocumentLibraryIds(docId: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DOC_LIBRARIES_KEY_PREFIX + docId, JSON.stringify(ids));
}
