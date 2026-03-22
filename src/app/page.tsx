"use client";

import { useState, useEffect, useCallback } from "react";
import { Editor } from "@/components/Editor";
import { Sidebar } from "@/components/Sidebar";
import { ContextPanel } from "@/components/ContextPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Document, loadDocuments, saveDocuments, createDocument } from "@/lib/documents";
import { loadDocumentContext, DocumentContext } from "@/lib/context";

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
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

  // Load context reactively. contextVersion bumps when the panel saves.
  const [activeContext, setActiveContext] = useState<DocumentContext>({
    styleGuide: "",
    referenceNotes: "",
    instructions: "",
  });

  useEffect(() => {
    if (activeDocId) {
      setActiveContext(loadDocumentContext(activeDocId));
    }
  }, [activeDocId]);

  // Poll for context changes from the panel (same-tab, no StorageEvent)
  useEffect(() => {
    if (!activeDocId || !contextPanelOpen) return;
    const interval = setInterval(() => {
      setActiveContext(loadDocumentContext(activeDocId));
    }, 500);
    return () => clearInterval(interval);
  }, [activeDocId, contextPanelOpen]);

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
            {/* Context panel toggle */}
            <button
              onClick={() => setContextPanelOpen(!contextPanelOpen)}
              className={`p-2 rounded-lg transition-colors ${
                contextPanelOpen
                  ? "bg-accent/10 text-accent"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
              aria-label="Toggle context panel"
              title="AI Context"
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
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Editor */}
        {activeDoc && (
          <Editor
            document={activeDoc}
            onUpdate={handleUpdateDocument}
            context={activeContext}
          />
        )}
      </main>

      {/* Overlay for mobile context panel */}
      {contextPanelOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-30 lg:hidden"
          onClick={() => setContextPanelOpen(false)}
        />
      )}

      {/* Right Context Panel */}
      {activeDocId && (
        <ContextPanel
          docId={activeDocId}
          isOpen={contextPanelOpen}
          onClose={() => setContextPanelOpen(false)}
        />
      )}
    </div>
  );
}
