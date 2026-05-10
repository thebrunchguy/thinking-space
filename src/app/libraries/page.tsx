"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Library,
  ExampleFile,
  loadLibraries,
  saveLibraries,
  createLibrary,
  createExampleFile,
  updateLibrary,
  deleteLibrary,
} from "@/lib/libraries";

function mergeLibraries(localLibs: Library[], fileLibs: Library[]): Library[] {
  const map = new Map<string, Library>();
  for (const l of localLibs) map.set(l.id, l);
  for (const l of fileLibs) {
    const existing = map.get(l.id);
    if (!existing || l.updatedAt > existing.updatedAt) {
      map.set(l.id, l);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt);
}

export default function LibrariesPage() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLibId, setSelectedLibId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [expandedLibs, setExpandedLibs] = useState<Set<string>>(new Set());
  const [newLibName, setNewLibName] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [addingFileTo, setAddingFileTo] = useState<string | null>(null);
  const [generatingOverview, setGeneratingOverview] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<"overview" | "file">("overview");

  useEffect(() => {
    const localLibs = loadLibraries();

    // Merge with file-persisted libraries, then sync all to disk
    fetch("/api/libraries")
      .then((res) => res.json())
      .then(({ libraries: fileLibs }) => {
        const merged = mergeLibraries(localLibs, fileLibs || []);
        setLibraries(merged);
        saveLibraries(merged);

        // Sync any libraries missing from disk
        for (const lib of merged) {
          const onDisk = (fileLibs || []).find((f: Library) => f.id === lib.id);
          if (!onDisk || lib.updatedAt > onDisk.updatedAt) {
            fetch("/api/libraries", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(lib),
            }).catch(() => {});
          }
        }
      })
      .catch(() => {
        setLibraries(localLibs);
      });

    setMounted(true);
  }, []);

  const selectedLib = libraries.find((l) => l.id === selectedLibId) || null;
  const selectedFile =
    selectedLib?.exampleFiles.find((f) => f.id === selectedFileId) || null;

  const saveLibToFile = useCallback((lib: Library) => {
    fetch("/api/libraries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lib),
    }).catch(() => {});
  }, []);

  const deleteLibFile = useCallback((id: string, name: string) => {
    fetch("/api/libraries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    }).catch(() => {});
  }, []);

  const persist = useCallback(
    (libs: Library[], changedLibId?: string) => {
      setLibraries(libs);
      saveLibraries(libs);
      // Save changed library to file
      if (changedLibId) {
        const lib = libs.find((l) => l.id === changedLibId);
        if (lib) saveLibToFile(lib);
      }
    },
    [saveLibToFile]
  );

  const handleAddLibrary = useCallback(() => {
    const name = newLibName.trim();
    if (!name) return;
    const lib = createLibrary(name);
    persist([...libraries, lib], lib.id);
    setNewLibName("");
    setSelectedLibId(lib.id);
    setExpandedLibs((prev) => new Set(prev).add(lib.id));
    setViewMode("overview");
    setSelectedFileId(null);
  }, [newLibName, libraries, persist]);

  const handleDeleteLibrary = useCallback(
    (id: string) => {
      const lib = libraries.find((l) => l.id === id);
      if (!confirm(`Archive "${lib?.name || "this library"}"? You can recover it later from the libraries/_archive folder.`)) return;
      const next = deleteLibrary(libraries, id);
      persist(next);
      deleteLibFile(id, lib?.name || "");
      if (selectedLibId === id) {
        setSelectedLibId(null);
        setSelectedFileId(null);
      }
    },
    [libraries, selectedLibId, persist, deleteLibFile]
  );

  const handleUpdateLibrary = useCallback(
    (field: keyof Library, value: string) => {
      if (!selectedLibId) return;
      const next = updateLibrary(libraries, selectedLibId, {
        [field]: value,
      });
      persist(next, selectedLibId);
    },
    [selectedLibId, libraries, persist]
  );

  const handleAddFile = useCallback(
    (libId: string) => {
      const name = newFileName.trim();
      if (!name) return;
      const file = createExampleFile(name);
      const next = libraries.map((lib) =>
        lib.id === libId
          ? {
              ...lib,
              exampleFiles: [...lib.exampleFiles, file],
              updatedAt: Date.now(),
            }
          : lib
      );
      persist(next, libId);
      setNewFileName("");
      setAddingFileTo(null);
      setSelectedLibId(libId);
      setSelectedFileId(file.id);
      setViewMode("file");
    },
    [newFileName, libraries, persist]
  );

  const handleDeleteFile = useCallback(
    (libId: string, fileId: string) => {
      const next = libraries.map((lib) =>
        lib.id === libId
          ? {
              ...lib,
              exampleFiles: lib.exampleFiles.filter((f) => f.id !== fileId),
              updatedAt: Date.now(),
            }
          : lib
      );
      persist(next, libId);
      if (selectedFileId === fileId) {
        setSelectedFileId(null);
        setViewMode("overview");
      }
    },
    [libraries, selectedFileId, persist]
  );

  const handleUpdateFileContent = useCallback(
    (content: string) => {
      if (!selectedLibId || !selectedFileId) return;
      const next = libraries.map((lib) =>
        lib.id === selectedLibId
          ? {
              ...lib,
              exampleFiles: lib.exampleFiles.map((f) =>
                f.id === selectedFileId ? { ...f, content } : f
              ),
              updatedAt: Date.now(),
            }
          : lib
      );
      persist(next, selectedLibId);
    },
    [selectedLibId, selectedFileId, libraries, persist]
  );

  const handleUpdateFileName = useCallback(
    (name: string) => {
      if (!selectedLibId || !selectedFileId) return;
      const next = libraries.map((lib) =>
        lib.id === selectedLibId
          ? {
              ...lib,
              exampleFiles: lib.exampleFiles.map((f) =>
                f.id === selectedFileId ? { ...f, name } : f
              ),
              updatedAt: Date.now(),
            }
          : lib
      );
      persist(next, selectedLibId);
    },
    [selectedLibId, selectedFileId, libraries, persist]
  );

  const toggleExpand = useCallback((libId: string) => {
    setExpandedLibs((prev) => {
      const next = new Set(prev);
      if (next.has(libId)) next.delete(libId);
      else next.add(libId);
      return next;
    });
  }, []);

  const handleSelectLibrary = useCallback((libId: string) => {
    setSelectedLibId(libId);
    setSelectedFileId(null);
    setViewMode("overview");
    setExpandedLibs((prev) => new Set(prev).add(libId));
  }, []);

  const handleSelectFile = useCallback((libId: string, fileId: string) => {
    setSelectedLibId(libId);
    setSelectedFileId(fileId);
    setViewMode("file");
  }, []);

  const handleGenerateOverview = useCallback(async () => {
    if (!selectedLib || selectedLib.exampleFiles.length === 0) return;
    setGeneratingOverview(true);
    try {
      const res = await fetch("/api/libraries/overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          libraryName: selectedLib.name,
          exampleFiles: selectedLib.exampleFiles
            .filter((f) => f.content.trim())
            .map((f) => ({ name: f.name, content: f.content })),
        }),
      });
      const data = await res.json();
      if (data.overview) {
        handleUpdateLibrary("generatedOverview", data.overview);
      }
    } catch {
      // silently fail
    } finally {
      setGeneratingOverview(false);
    }
  }, [selectedLib, handleUpdateLibrary]);

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left sidebar */}
      <aside className="w-72 flex-shrink-0 border-r border-border bg-sidebar flex flex-col h-full">
        {/* Header */}
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <h1 className="text-sm font-semibold text-sidebar-foreground uppercase tracking-wider">
            Libraries
          </h1>
          <Link
            href="/"
            className="p-1.5 rounded-lg hover:bg-sidebar-hover text-muted-foreground hover:text-sidebar-foreground transition-colors"
            title="Back to editor"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </Link>
        </div>

        {/* Library list */}
        <div className="flex-1 overflow-y-auto py-2">
          {libraries.map((lib) => (
            <div key={lib.id}>
              {/* Library heading */}
              <div
                className={`group flex items-center gap-1 px-3 py-2 mx-2 rounded-lg cursor-pointer transition-colors ${
                  selectedLibId === lib.id && viewMode === "overview"
                    ? "bg-sidebar-active text-sidebar-foreground"
                    : "hover:bg-sidebar-hover text-sidebar-foreground"
                }`}
              >
                {/* Expand toggle */}
                <button
                  onClick={() => toggleExpand(lib.id)}
                  className="p-0.5 rounded hover:bg-sidebar-hover text-muted-foreground flex-shrink-0"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-transform ${
                      expandedLibs.has(lib.id) ? "rotate-90" : ""
                    }`}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                <span
                  className="text-sm font-medium truncate flex-1"
                  onClick={() => handleSelectLibrary(lib.id)}
                >
                  {lib.name}
                </span>

                {/* File count badge */}
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {lib.exampleFiles.length}
                </span>

                {/* Delete */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteLibrary(lib.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted-foreground/20 text-muted-foreground transition-opacity flex-shrink-0"
                  title="Delete library"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Example files list */}
              {expandedLibs.has(lib.id) && (
                <div className="ml-6 mr-2 mb-1">
                  {lib.exampleFiles.map((file) => (
                    <div
                      key={file.id}
                      className={`group/file flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors text-sm ${
                        selectedFileId === file.id
                          ? "bg-sidebar-active text-sidebar-foreground"
                          : "hover:bg-sidebar-hover text-muted-foreground"
                      }`}
                      onClick={() => handleSelectFile(lib.id, file.id)}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="flex-shrink-0 opacity-50"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span className="truncate">{file.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(lib.id, file.id);
                        }}
                        className="opacity-0 group-hover/file:opacity-100 ml-auto p-0.5 rounded hover:bg-muted-foreground/20 text-muted-foreground transition-opacity flex-shrink-0"
                        title="Delete file"
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  {/* Add file inline */}
                  {addingFileTo === lib.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddFile(lib.id);
                      }}
                      className="flex gap-1 px-3 py-1"
                    >
                      <input
                        type="text"
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        placeholder="File name..."
                        className="flex-1 bg-muted/50 border border-border rounded px-2 py-0.5 text-xs outline-none focus:border-accent/50 min-w-0"
                        autoFocus
                        onBlur={() => {
                          if (!newFileName.trim()) setAddingFileTo(null);
                        }}
                      />
                      <button
                        type="submit"
                        disabled={!newFileName.trim()}
                        className="text-[10px] px-1.5 py-0.5 bg-accent text-accent-foreground rounded disabled:opacity-40"
                      >
                        Add
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => {
                        setAddingFileTo(lib.id);
                        setNewFileName("");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-sidebar-foreground transition-colors w-full"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add example
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add new library */}
        <div className="px-3 py-3 border-t border-border">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddLibrary();
            }}
            className="flex gap-1.5"
          >
            <input
              type="text"
              value={newLibName}
              onChange={(e) => setNewLibName(e.target.value)}
              placeholder="New library..."
              className="flex-1 bg-muted/50 border border-border rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent/50 transition-colors min-w-0"
            />
            <button
              type="submit"
              disabled={!newLibName.trim()}
              className="px-2.5 py-1.5 text-xs font-medium bg-accent text-accent-foreground rounded-md hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {selectedLib && viewMode === "overview" ? (
          <>
            {/* Library header */}
            <header className="px-8 py-6 border-b border-border">
              <input
                type="text"
                value={selectedLib.name}
                onChange={(e) => handleUpdateLibrary("name", e.target.value)}
                className="text-2xl font-semibold bg-transparent outline-none w-full text-foreground"
              />
              <input
                type="text"
                value={selectedLib.description}
                onChange={(e) =>
                  handleUpdateLibrary("description", e.target.value)
                }
                placeholder="Brief description of this style..."
                className="mt-1 text-sm text-muted-foreground bg-transparent outline-none w-full placeholder:text-muted-foreground/40"
              />
            </header>

            {/* Overview content */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
              {/* Generated Overview */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    General Overview
                  </h2>
                  <button
                    onClick={handleGenerateOverview}
                    disabled={
                      generatingOverview ||
                      selectedLib.exampleFiles.filter((f) => f.content.trim())
                        .length === 0
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {generatingOverview ? (
                      <>
                        <svg
                          className="animate-spin"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                        </svg>
                        {selectedLib.generatedOverview
                          ? "Regenerate"
                          : "Auto-generate from examples"}
                      </>
                    )}
                  </button>
                </div>
                {selectedLib.generatedOverview ? (
                  <textarea
                    value={selectedLib.generatedOverview}
                    onChange={(e) =>
                      handleUpdateLibrary("generatedOverview", e.target.value)
                    }
                    rows={10}
                    className="w-full bg-muted/30 border border-border rounded-lg px-4 py-3 text-sm text-foreground leading-relaxed resize-y outline-none focus:border-accent/50 transition-colors"
                  />
                ) : (
                  <div className="w-full bg-muted/30 border border-border/50 border-dashed rounded-lg px-4 py-8 text-center text-sm text-muted-foreground/60">
                    {selectedLib.exampleFiles.length === 0
                      ? "Add example files first, then generate an overview of your writing style."
                      : "Click \"Auto-generate from examples\" to create a style overview based on your example files."}
                  </div>
                )}
              </section>

              {/* Style Rules */}
              <FieldSection
                label="Style Rules"
                placeholder="Tone, voice, sentence length, perspective, formality level..."
                value={selectedLib.styleRules}
                onChange={(v) => handleUpdateLibrary("styleRules", v)}
              />

              {/* Vocabulary */}
              <FieldSection
                label="Vocabulary"
                placeholder="Preferred words, phrases to use or avoid..."
                value={selectedLib.vocabulary}
                onChange={(v) => handleUpdateLibrary("vocabulary", v)}
              />

              {/* Structure Notes */}
              <FieldSection
                label="Structure Notes"
                placeholder="Formatting patterns, paragraph structure, content flow..."
                value={selectedLib.structureNotes}
                onChange={(v) => handleUpdateLibrary("structureNotes", v)}
              />

              {/* Example files summary */}
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Example Files ({selectedLib.exampleFiles.length})
                </h2>
                {selectedLib.exampleFiles.length > 0 ? (
                  <div className="grid gap-2">
                    {selectedLib.exampleFiles.map((file) => (
                      <button
                        key={file.id}
                        onClick={() =>
                          handleSelectFile(selectedLib.id, file.id)
                        }
                        className="flex items-center gap-3 px-4 py-3 bg-muted/30 border border-border rounded-lg hover:bg-muted/50 transition-colors text-left group"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-muted-foreground flex-shrink-0"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {file.name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {file.content
                              ? file.content.slice(0, 80) +
                                (file.content.length > 80 ? "..." : "")
                              : "Empty"}
                          </div>
                        </div>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground/60 border border-border/50 border-dashed rounded-lg px-4 py-6 text-center">
                    No example files yet. Use the sidebar to add examples.
                  </div>
                )}
              </section>

              {/* Feedback history */}
              {(selectedLib.feedback || []).length > 0 && (
                <section>
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Edit History ({selectedLib.feedback.length})
                  </h2>
                  <div className="space-y-2">
                    {[...(selectedLib.feedback || [])]
                      .reverse()
                      .slice(0, 20)
                      .map((fb) => (
                        <div
                          key={fb.id}
                          className="px-4 py-3 bg-muted/30 border border-border rounded-lg text-sm"
                        >
                          <div className="flex items-start gap-2 mb-1">
                            <span className="text-red-500/70 line-through leading-relaxed flex-1">
                              {fb.aiSuggested.length > 120
                                ? fb.aiSuggested.slice(0, 120) + "..."
                                : fb.aiSuggested}
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-green-600 dark:text-green-400 leading-relaxed flex-1">
                              {fb.userEdited.length > 120
                                ? fb.userEdited.slice(0, 120) + "..."
                                : fb.userEdited}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground/50 mt-1.5">
                            {new Date(fb.timestamp).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      ))}
                  </div>
                </section>
              )}
            </div>
          </>
        ) : selectedLib && selectedFile && viewMode === "file" ? (
          <>
            {/* File editor header */}
            <header className="px-8 py-4 border-b border-border flex items-center gap-3">
              <button
                onClick={() => {
                  setViewMode("overview");
                  setSelectedFileId(null);
                }}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Back to overview"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {selectedLib.name} /
                  </span>
                  <input
                    type="text"
                    value={selectedFile.name}
                    onChange={(e) => handleUpdateFileName(e.target.value)}
                    className="text-sm font-medium bg-transparent outline-none flex-1 min-w-0"
                  />
                </div>
              </div>
            </header>

            {/* File content editor */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <textarea
                value={selectedFile.content}
                onChange={(e) => handleUpdateFileContent(e.target.value)}
                placeholder="Paste an example of your writing here..."
                className="flex-1 w-full bg-transparent px-8 py-6 text-sm text-foreground leading-relaxed resize-none outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="text-muted-foreground/40 mb-3">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mx-auto"
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">
                Select a library to view its style overview and example files.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function FieldSection({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </h2>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full bg-muted/30 border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 resize-y outline-none focus:border-accent/50 transition-colors leading-relaxed"
      />
    </section>
  );
}
