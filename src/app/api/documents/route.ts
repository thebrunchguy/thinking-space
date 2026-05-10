import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DOCS_DIR = path.join(process.cwd(), "documents");

function ensureDir() {
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Find existing file for a doc id (any filename)
function findFileById(id: string): string | null {
  if (!fs.existsSync(DOCS_DIR)) return null;
  const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));
  for (const f of files) {
    const raw = fs.readFileSync(path.join(DOCS_DIR, f), "utf-8");
    const match = raw.match(/^id:\s*(.+)$/m);
    if (match && match[1].trim() === id) return f;
  }
  return null;
}

interface NoteMeta {
  id: string;
  text: string;
  savedAt: number;
}

interface DocMeta {
  id: string;
  title: string;
  libraryIds: string[];
  notes: NoteMeta[];
  createdAt: number;
  updatedAt: number;
}

function toFile(doc: DocMeta & { content: string }): string {
  const frontmatter = [
    "---",
    `id: ${doc.id}`,
    `title: ${JSON.stringify(doc.title)}`,
    `libraryIds: ${JSON.stringify(doc.libraryIds || [])}`,
    `notes: ${JSON.stringify(doc.notes || [])}`,
    `createdAt: ${doc.createdAt}`,
    `updatedAt: ${doc.updatedAt}`,
    "---",
    "",
    doc.content || "",
  ].join("\n");
  return frontmatter;
}

function fromFile(raw: string): (DocMeta & { content: string }) | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) return null;

  const meta = match[1];
  const content = match[2];

  const getId = meta.match(/^id:\s*(.+)$/m);
  const getTitle = meta.match(/^title:\s*(.+)$/m);
  const getLibs = meta.match(/^libraryIds:\s*(.+)$/m);
  const getCreated = meta.match(/^createdAt:\s*(\d+)$/m);
  const getUpdated = meta.match(/^updatedAt:\s*(\d+)$/m);

  if (!getId) return null;

  let title = getId ? getId[1].trim() : "Untitled";
  try {
    title = getTitle ? JSON.parse(getTitle[1].trim()) : "Untitled";
  } catch {
    title = getTitle ? getTitle[1].trim() : "Untitled";
  }

  let libraryIds: string[] = [];
  try {
    libraryIds = getLibs ? JSON.parse(getLibs[1].trim()) : [];
  } catch {
    libraryIds = [];
  }

  const getNotes = meta.match(/^notes:\s*(.+)$/m);
  let notes: NoteMeta[] = [];
  try {
    notes = getNotes ? JSON.parse(getNotes[1].trim()) : [];
  } catch {
    notes = [];
  }

  return {
    id: getId[1].trim(),
    title,
    libraryIds,
    notes,
    createdAt: getCreated ? parseInt(getCreated[1]) : Date.now(),
    updatedAt: getUpdated ? parseInt(getUpdated[1]) : Date.now(),
    content,
  };
}

// GET — load all documents from files
export async function GET() {
  try {
    ensureDir();
    const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));
    const docs = files
      .map((f) => {
        const raw = fs.readFileSync(path.join(DOCS_DIR, f), "utf-8");
        return fromFile(raw);
      })
      .filter(Boolean);

    docs.sort((a, b) => (b!.updatedAt || 0) - (a!.updatedAt || 0));
    return NextResponse.json({ documents: docs });
  } catch (error) {
    console.error("Failed to load documents:", error);
    return NextResponse.json({ documents: [] });
  }
}

// POST — save a document to a file
export async function POST(request: NextRequest) {
  try {
    ensureDir();
    const doc = await request.json();
    if (!doc.id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Remove old file if it exists (handles renames)
    const oldFile = findFileById(doc.id);
    const slug = slugify(doc.title || "untitled") || doc.id;
    const newFileName = `${slug}.md`;

    if (oldFile && oldFile !== newFileName) {
      fs.unlinkSync(path.join(DOCS_DIR, oldFile));
    }

    const filePath = path.join(DOCS_DIR, newFileName);
    fs.writeFileSync(filePath, toFile(doc), "utf-8");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to save document:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

// DELETE — remove a document file
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Find by id since filename may be slug-based or id-based
    const file = findFileById(id);
    if (file) {
      fs.unlinkSync(path.join(DOCS_DIR, file));
    } else {
      // Fallback: try old id-based filename
      const fallback = path.join(DOCS_DIR, `${id}.md`);
      if (fs.existsSync(fallback)) fs.unlinkSync(fallback);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete document:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
