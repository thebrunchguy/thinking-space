"use client";

import { useState, useEffect, useCallback } from "react";
import { Editor } from "@/components/Editor";
import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LibraryManager } from "@/components/LibraryManager";
import { LibrarySelector } from "@/components/LibrarySelector";
import { Document, loadDocuments, saveDocuments, createDocument } from "@/lib/documents";
import { Library, loadLibraries, getLibrariesById } from "@/lib/libraries";

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [libraryManagerOpen, setLibraryManagerOpen] = useState(false);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [instructions, setInstructions] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const docs = loadDocuments();
    if (docs.length === 0) {
      const first = createDocument();
      setDocuments([first]);
      setActiveDocId(first.id);
      saveDocuments([first]);
    } else {
      setDocuments(docs);
      setActiveDocId(docs[0].id);
    }
    setLibraries(loadLibraries());
    setMounted(true);
  }, []);

  // Refresh libraries when manager closes
  useEffect(() => {
    if (!libraryManagerOpen) {
      setLibraries(loadLibraries());
    }
  }, [libraryManagerOpen]);

  const activeDoc = documents.find((d) => d.id === activeDocId) || null;
  const activeLibraries = activeDoc
    ? getLibrariesById(libraries, activeDoc.libraryIds || [])
    : [];

  const handleUpdateDocument = useCallback(
    (updates: Partial<Document>) => {
      setDocuments((prev) => {
        const next = prev.map((d) =>
          d.id === activeDocId
            ? { ...d, ...updates, updatedAt: Date.now() }
            : d
        );
        saveDocuments(next);
        return next;
      });
    },
    [activeDocId]
  );

  const handleLibraryChange = useCallback(
    (ids: string[]) => {
      handleUpdateDocument({ libraryIds: ids });
    },
    [handleUpdateDocument]
  );

  const handleNewDocument = useCallback(() => {
    const doc = createDocument();
    setDocuments((prev) => {
      const next = [doc, ...prev];
      saveDocuments(next);
      return next;
    });
    setActiveDocId(doc.id);
    setSidebarOpen(false);
  }, []);

  const handleDeleteDocument = useCallback(
    (id: string) => {
      setDocuments((prev) => {
        const next = prev.filter((d) => d.id !== id);
        if (id === activeDocId) {
          if (next.length > 0) {
            setActiveDocId(next[0].id);
          } else {
            const fresh = createDocument();
            next.push(fresh);
            setActiveDocId(fresh.id);
          }
        }
        saveDocuments(next);
        return next;
      });
    },
    [activeDocId]
  );

  const handleSelectDocument = useCallback((id: string) => {
    setActiveDocId(id);
    setSidebarOpen(false);
  }, []);

  if (!mounted) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex relative">
      {/* Left Sidebar */}
      <Sidebar
        documents={documents}
        activeDocId={activeDocId}
        isOpen={sidebarOpen}
        onSelect={handleSelectDocument}
        onNew={handleNewDocument}
        onDelete={handleDeleteDocument}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main editor area */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Toggle sidebar"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {activeDoc
                ? new Date(activeDoc.updatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : ""}
            </span>
            <ThemeToggle />
            {/* Libraries button */}
            <button
              onClick={() => setLibraryManagerOpen(true)}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Manage libraries"
              title="Manage Libraries"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Library selector + instructions bar */}
        {activeDoc && (
          <div className="px-6 md:px-8 pt-4 max-w-[720px] mx-auto w-full">
            <div className="flex items-start gap-3 flex-wrap">
              <LibrarySelector
                libraries={libraries}
                selectedIds={activeDoc.libraryIds || []}
                onChange={handleLibraryChange}
              />
            </div>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Quick instruction for AI suggestions (e.g., 'make it punchier')..."
              className="mt-2 w-full bg-transparent border-b border-border/50 focus:border-accent/50 outline-none text-xs text-muted-foreground placeholder:text-muted-foreground/40 pb-1 transition-colors"
            />
          </div>
        )}

        {/* Editor */}
        {activeDoc && (
          <Editor
            document={activeDoc}
            onUpdate={handleUpdateDocument}
            libraries={activeLibraries}
            instructions={instructions}
          />
        )}
      </main>

      {/* Library Manager Modal */}
      <LibraryManager
        isOpen={libraryManagerOpen}
        onClose={() => setLibraryManagerOpen(false)}
      />
    </div>
  );
}
