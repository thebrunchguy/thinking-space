"use client";

import { useState, useEffect, useCallback } from "react";
import { Editor, ChatSelection } from "@/components/Editor";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { LibrarySelector } from "@/components/LibrarySelector";
import { Document, Note, loadDocuments, saveDocuments, createDocument, generateId } from "@/lib/documents";
import { Library, SuggestionFeedback, loadLibraries, saveLibraries as saveLibsToStorage, getLibrariesById } from "@/lib/libraries";

function saveDocToFile(doc: Document) {
  fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  }).catch(() => {});
}

function deleteDocFile(id: string) {
  fetch("/api/documents", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  }).catch(() => {});
}

function mergeDocs(localDocs: Document[], fileDocs: Document[]): Document[] {
  const map = new Map<string, Document>();
  for (const d of localDocs) map.set(d.id, d);
  for (const d of fileDocs) {
    const existing = map.get(d.id);
    if (!existing || d.updatedAt > existing.updatedAt) {
      map.set(d.id, d);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [instructions, setInstructions] = useState("");
  const [mounted, setMounted] = useState(false);
  const [chatSelection, setChatSelection] = useState<ChatSelection | null>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [pendingSuggestion, setPendingSuggestion] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"improve" | "notes" | "content">("improve");
  const [focusMode, setFocusMode] = useState(false);
  const [tocOpen, setTocOpen] = useState(true);

  useEffect(() => {
    // Load from localStorage first (fast)
    const localDocs = loadDocuments();

    // Then load from files and merge (prefer newer updatedAt)
    fetch("/api/documents")
      .then((res) => res.json())
      .then(({ documents: fileDocs }) => {
        const merged = mergeDocs(localDocs, fileDocs || []);
        if (merged.length === 0) {
          const first = createDocument();
          setDocuments([first]);
          setActiveDocId(first.id);
          saveDocuments([first]);
          saveDocToFile(first);
        } else {
          setDocuments(merged);
          setActiveDocId(merged[0].id);
          saveDocuments(merged);

          // Sync any docs missing from disk or newer in localStorage
          for (const doc of merged) {
            const onDisk = (fileDocs || []).find((f: Document) => f.id === doc.id);
            if (!onDisk || doc.updatedAt > onDisk.updatedAt) {
              saveDocToFile(doc);
            }
          }
        }
      })
      .catch(() => {
        // File API unavailable — use localStorage only
        if (localDocs.length === 0) {
          const first = createDocument();
          setDocuments([first]);
          setActiveDocId(first.id);
          saveDocuments([first]);
        } else {
          setDocuments(localDocs);
          setActiveDocId(localDocs[0].id);
        }
      });

    setLibraries(loadLibraries());
    setMounted(true);
  }, []);

  // Refresh libraries on focus (in case user edited them on /libraries page)
  useEffect(() => {
    const handleFocus = () => setLibraries(loadLibraries());
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  // Cmd+H toggle left sidebar, Cmd+L toggle right panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "h") {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "o") {
        e.preventDefault();
        setChatOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "g") {
        e.preventDefault();
        setFocusMode((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
        const updated = next.find((d) => d.id === activeDocId);
        if (updated) saveDocToFile(updated);
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
    saveDocToFile(doc);
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
            saveDocToFile(fresh);
          }
        }
        saveDocuments(next);
        return next;
      });
      deleteDocFile(id);
    },
    [activeDocId]
  );

  const handleSelectDocument = useCallback((id: string) => {
    setActiveDocId(id);
  }, []);

  const handleOpenChat = useCallback((selection: ChatSelection) => {
    setChatSelection(selection);
    setChatOpen(true);
    setPendingSuggestion(null);
    setRightTab("improve");
  }, []);

  const handleCloseChat = useCallback(() => {
    setChatOpen(false);
    setChatSelection(null);
    setPendingSuggestion(null);
  }, []);

  const handleMakeSuggestion = useCallback((suggestedText: string) => {
    setPendingSuggestion(suggestedText);
  }, []);

  const handleSuggestionApplied = useCallback(() => {
    setPendingSuggestion(null);
    setChatOpen(false);
    setChatSelection(null);
  }, []);

  const handleSaveNote = useCallback(
    (text: string, sectionName: string) => {
      const note: Note = { id: generateId(), text, section: sectionName, savedAt: Date.now() };
      handleUpdateDocument({
        notes: [...(activeDoc?.notes || []), note],
      });
      setRightTab("notes");
      setChatOpen(true);
    },
    [activeDoc, handleUpdateDocument]
  );

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      handleUpdateDocument({
        notes: (activeDoc?.notes || []).filter((n) => n.id !== noteId),
      });
    },
    [activeDoc, handleUpdateDocument]
  );

  const handleRestoreNote = useCallback(
    (noteId: string) => {
      // Handled by editor — we just remove from notes after
      // For now, copy to clipboard and remove
      const note = (activeDoc?.notes || []).find((n) => n.id === noteId);
      if (note) {
        navigator.clipboard.writeText(note.text).then(() => {
          handleUpdateDocument({
            notes: (activeDoc?.notes || []).filter((n) => n.id !== noteId),
          });
        });
      }
    },
    [activeDoc, handleUpdateDocument]
  );

  const handleSuggestionFeedback = useCallback(
    (aiSuggested: string, userEdited: string) => {
      const feedback: SuggestionFeedback = {
        id: generateId(),
        aiSuggested,
        userEdited,
        timestamp: Date.now(),
      };
      const libIds = activeDoc?.libraryIds || [];
      setLibraries((prev) => {
        // If libraries are assigned, save to those; otherwise save to all
        const matchingIds = libIds.filter((id) => prev.some((l) => l.id === id));
        const next = prev.map((lib) => {
          if (matchingIds.length > 0 && !matchingIds.includes(lib.id)) return lib;
          const existing = lib.feedback || [];
          const updated = [...existing, feedback].slice(-50);
          return { ...lib, feedback: updated, updatedAt: Date.now() };
        });
        saveLibsToStorage(next);
        return next;
      });
    },
    [activeDoc]
  );

  if (!mounted) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left Sidebar */}
      <Sidebar
        documents={documents}
        activeDocId={activeDocId}
        isOpen={sidebarOpen}
        focusMode={focusMode}
        onToggleFocusMode={() => setFocusMode(!focusMode)}
        onSelect={handleSelectDocument}
        onNew={handleNewDocument}
        onDelete={handleDeleteDocument}
        onClose={() => setSidebarOpen(false)}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main editor area */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-end px-4 py-3 border-b border-border">
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
        </header>

        {/* Editor */}
        {activeDoc && (
          <Editor
            document={activeDoc}
            onUpdate={handleUpdateDocument}
            libraries={activeLibraries}
            instructions={instructions}
            focusMode={focusMode}
            tocOpen={tocOpen}
            onOpenChat={handleOpenChat}
            onSaveNote={handleSaveNote}
            onSuggestionFeedback={handleSuggestionFeedback}
            chatSelection={chatSelection}
            pendingSuggestion={pendingSuggestion}
            onSuggestionApplied={handleSuggestionApplied}
          />
        )}
      </main>

      {/* Right sidebar — tabs: Improve / Notes / Content */}
      {chatOpen && activeDoc && (
        <aside className="w-80 flex-shrink-0 bg-sidebar flex flex-col min-h-0 border-l border-border/50">
          {/* Tabs */}
          <div className="flex border-b border-border/50">
            {(["improve", "notes", "content"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 px-2 py-2.5 text-xs font-medium capitalize transition-colors ${
                  rightTab === tab
                    ? "text-foreground border-b-2 border-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Improve tab */}
          {rightTab === "improve" && (
            <>
              {/* Style controls */}
              <div className="px-3 py-3 border-b border-border/50">
                <LibrarySelector
                  libraries={libraries}
                  selectedIds={activeDoc.libraryIds || []}
                  onChange={handleLibraryChange}
                />
                <input
                  type="text"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Quick instruction (e.g., 'make it punchier')..."
                  className="mt-2 w-full bg-transparent border-b border-border/30 focus:border-accent/50 outline-none text-xs text-muted-foreground placeholder:text-muted-foreground/40 pb-1 transition-colors"
                />
              </div>
              <ChatPanel
                selectedText={chatSelection?.text ?? ""}
                fullDocument={activeDoc.content}
                sectionText={chatSelection?.sectionText ?? ""}
                libraries={activeLibraries}
                mode={chatSelection?.mode ?? "improve"}
                quickRewrite={chatSelection?.quickRewrite}
                onMakeSuggestion={handleMakeSuggestion}
                onClose={handleCloseChat}
              />
            </>
          )}

          {/* Notes tab */}
          {rightTab === "notes" && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto">
                {(activeDoc.notes || []).length === 0 ? (
                  <div className="flex-1 flex items-center justify-center px-6 py-12">
                    <p className="text-xs text-muted-foreground text-center leading-relaxed">
                      Select text and press{" "}
                      <kbd className="px-1.5 py-0.5 rounded bg-sidebar-hover border border-border/50 text-[10px] font-mono">⌘M</kbd>{" "}
                      to save it here for later
                    </p>
                  </div>
                ) : (
                  <div className="px-3 py-2 space-y-2">
                    {(activeDoc.notes || []).map((note) => (
                      <div
                        key={note.id}
                        className="group bg-muted/30 border border-border/50 rounded-lg px-3 py-2.5"
                      >
                        {note.section && (
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                            {note.section}
                          </p>
                        )}
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                          {note.text}
                        </p>
                        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-border/30">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(note.savedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleRestoreNote(note.id)}
                              className="px-1.5 py-0.5 text-[10px] rounded hover:bg-sidebar-hover text-muted-foreground hover:text-foreground transition-colors"
                              title="Copy to clipboard & remove"
                            >
                              Restore
                            </button>
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="px-1.5 py-0.5 text-[10px] rounded hover:bg-sidebar-hover text-muted-foreground hover:text-foreground transition-colors"
                              title="Delete note"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Content tab */}
          {rightTab === "content" && (
            <div className="flex-1 flex items-center justify-center px-6">
              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                Coming soon
              </p>
            </div>
          )}
        </aside>
      )}

    </div>
  );
}
