import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const LIBS_DIR = path.join(process.cwd(), "libraries");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface ExampleFile {
  id: string;
  name: string;
  content: string;
  createdAt: number;
}

interface LibraryData {
  id: string;
  name: string;
  description: string;
  styleRules: string;
  referenceSamples: string;
  vocabulary: string;
  structureNotes: string;
  exampleFiles: ExampleFile[];
  generatedOverview: string;
  createdAt: number;
  updatedAt: number;
}

// Write the _library.md meta file
function writeLibraryMeta(libDir: string, lib: LibraryData) {
  const frontmatter = [
    "---",
    `id: ${lib.id}`,
    `name: ${JSON.stringify(lib.name)}`,
    `description: ${JSON.stringify(lib.description)}`,
    `createdAt: ${lib.createdAt}`,
    `updatedAt: ${lib.updatedAt}`,
    `styleRules: ${JSON.stringify(lib.styleRules)}`,
    `vocabulary: ${JSON.stringify(lib.vocabulary)}`,
    `structureNotes: ${JSON.stringify(lib.structureNotes)}`,
    `referenceSamples: ${JSON.stringify(lib.referenceSamples)}`,
    "---",
    "",
    lib.generatedOverview || "",
  ].join("\n");
  fs.writeFileSync(path.join(libDir, "_library.md"), frontmatter, "utf-8");
}

// Write each example file as its own .md
function writeExampleFile(libDir: string, file: ExampleFile) {
  const frontmatter = [
    "---",
    `id: ${file.id}`,
    `name: ${JSON.stringify(file.name)}`,
    `createdAt: ${file.createdAt}`,
    "---",
    "",
    file.content || "",
  ].join("\n");
  const slug = slugify(file.name) || file.id;
  fs.writeFileSync(path.join(libDir, `${slug}.md`), frontmatter, "utf-8");
}

// Read a library from its directory
function readLibrary(libDir: string): LibraryData | null {
  const metaPath = path.join(libDir, "_library.md");
  if (!fs.existsSync(metaPath)) return null;

  const raw = fs.readFileSync(metaPath, "utf-8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) return null;

  const meta = match[1];
  const overview = match[2];

  const get = (key: string) => {
    const m = meta.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return m ? m[1].trim() : "";
  };

  const parseStr = (key: string): string => {
    const val = get(key);
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  };

  // Read example files
  const exampleFiles: ExampleFile[] = [];
  const files = fs.readdirSync(libDir).filter((f) => f.endsWith(".md") && f !== "_library.md");
  for (const f of files) {
    const fileRaw = fs.readFileSync(path.join(libDir, f), "utf-8");
    const fileMatch = fileRaw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
    if (!fileMatch) continue;

    const fileMeta = fileMatch[1];
    const fileContent = fileMatch[2];

    const getF = (key: string) => {
      const m = fileMeta.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
      return m ? m[1].trim() : "";
    };

    let fileName = getF("name");
    try {
      fileName = JSON.parse(fileName);
    } catch {}

    exampleFiles.push({
      id: getF("id") || f.replace(".md", ""),
      name: fileName || f.replace(".md", ""),
      content: fileContent,
      createdAt: parseInt(getF("createdAt")) || Date.now(),
    });
  }

  exampleFiles.sort((a, b) => a.createdAt - b.createdAt);

  return {
    id: get("id"),
    name: parseStr("name"),
    description: parseStr("description"),
    styleRules: parseStr("styleRules"),
    vocabulary: parseStr("vocabulary"),
    structureNotes: parseStr("structureNotes"),
    referenceSamples: parseStr("referenceSamples"),
    exampleFiles,
    generatedOverview: overview,
    createdAt: parseInt(get("createdAt")) || Date.now(),
    updatedAt: parseInt(get("updatedAt")) || Date.now(),
  };
}

// GET — load all libraries from files
export async function GET() {
  try {
    ensureDir(LIBS_DIR);
    const dirs = fs
      .readdirSync(LIBS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "_archive")
      .map((d) => d.name);

    const libraries = dirs
      .map((d) => readLibrary(path.join(LIBS_DIR, d)))
      .filter(Boolean);

    libraries.sort((a, b) => (a!.createdAt || 0) - (b!.createdAt || 0));
    return NextResponse.json({ libraries });
  } catch (error) {
    console.error("Failed to load libraries:", error);
    return NextResponse.json({ libraries: [] });
  }
}

// POST — save a single library (meta + all example files)
export async function POST(request: NextRequest) {
  try {
    ensureDir(LIBS_DIR);
    const lib: LibraryData = await request.json();
    if (!lib.id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const slug = slugify(lib.name) || lib.id;
    const libDir = path.join(LIBS_DIR, slug);
    ensureDir(libDir);

    // Clean out old example files (keep _library.md)
    const existing = fs.readdirSync(libDir).filter((f) => f.endsWith(".md") && f !== "_library.md");
    for (const f of existing) {
      fs.unlinkSync(path.join(libDir, f));
    }

    // Write meta + examples
    writeLibraryMeta(libDir, lib);
    for (const file of lib.exampleFiles || []) {
      writeExampleFile(libDir, file);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to save library:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

// DELETE — archive a library directory (move to _archive/)
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const archiveDir = path.join(LIBS_DIR, "_archive");
    ensureDir(archiveDir);
    ensureDir(LIBS_DIR);

    const dirs = fs
      .readdirSync(LIBS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "_archive")
      .map((d) => d.name);

    for (const dir of dirs) {
      const lib = readLibrary(path.join(LIBS_DIR, dir));
      if (lib && lib.id === id) {
        const dest = path.join(archiveDir, dir);
        // Remove existing archive if re-archiving
        if (fs.existsSync(dest)) {
          fs.rmSync(dest, { recursive: true });
        }
        fs.renameSync(path.join(LIBS_DIR, dir), dest);
        break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to archive library:", error);
    return NextResponse.json({ error: "Failed to archive" }, { status: 500 });
  }
}
