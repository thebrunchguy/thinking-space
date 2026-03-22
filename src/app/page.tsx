"use client";

import { useState, useEffect, useCallback } from "react";
import { Editor } from "@/components/Editor";
import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Document, loadDocuments, saveDocuments, createDocument } from "@/lib/documents";

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    setMounted(true);
  }, []);

  const activeDoc = documents.find((d) => d.id === activeDocId) || null;

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
      {/* Sidebar */}
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
          </div>
        </header>

        {/* Editor */}
        {activeDoc && (
          <Editor document={activeDoc} onUpdate={handleUpdateDocument} />
        )}
      </main>
    </div>
  );
}
