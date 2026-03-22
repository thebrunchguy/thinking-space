"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Library,
  loadLibraries,
  saveLibraries,
  createLibrary,
  updateLibrary,
  deleteLibrary,
} from "@/lib/libraries";

interface LibraryManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LibraryManager({ isOpen, onClose }: LibraryManagerProps) {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (isOpen) {
      setLibraries(loadLibraries());
    }
  }, [isOpen]);

  const selected = libraries.find((l) => l.id === selectedId) || null;

  const handleUpdate = useCallback(
    (field: keyof Library, value: string) => {
      if (!selectedId) return;
      setLibraries((prev) => {
        const next = updateLibrary(prev, selectedId, { [field]: value });
        saveLibraries(next);
        return next;
      });
    },
    [selectedId]
  );

  const handleAdd = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const lib = createLibrary(name);
    setLibraries((prev) => {
      const next = [...prev, lib];
      saveLibraries(next);
      return next;
    });
    setNewName("");
    setSelectedId(lib.id);
  }, [newName]);

  const handleDelete = useCallback(
    (id: string) => {
      setLibraries((prev) => {
        const next = deleteLibrary(prev, id);
        saveLibraries(next);
        return next;
      });
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-surface border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex overflow-hidden">
        {/* Library list */}
        <div className="w-56 flex-shrink-0 border-r border-border flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Libraries
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {libraries.map((lib) => (
              <div
                key={lib.id}
                className={`group flex items-center justify-between px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors ${
                  selectedId === lib.id
                    ? "bg-accent/10 text-accent"
                    : "hover:bg-muted text-foreground"
                }`}
                onClick={() => setSelectedId(lib.id)}
              >
                <span className="text-sm truncate">{lib.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(lib.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted-foreground/20 text-muted-foreground transition-opacity"
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
            ))}
          </div>

          {/* Add new */}
          <div className="px-3 py-3 border-t border-border">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAdd();
              }}
              className="flex gap-1.5"
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New library..."
                className="flex-1 bg-muted/50 border border-border rounded-md px-2 py-1 text-sm outline-none focus:border-accent/50 transition-colors min-w-0"
              />
              <button
                type="submit"
                disabled={!newName.trim()}
                className="px-2 py-1 text-xs font-medium bg-accent text-accent-foreground rounded-md hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </form>
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="flex-1 min-w-0">
              {selected ? (
                <input
                  type="text"
                  value={selected.name}
                  onChange={(e) => handleUpdate("name", e.target.value)}
                  className="text-lg font-semibold bg-transparent outline-none w-full"
                />
              ) : (
                <span className="text-sm text-muted-foreground">
                  Select a library to edit
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="ml-4 p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Close"
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {selected ? (
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Description
                </label>
                <input
                  type="text"
                  value={selected.description}
                  onChange={(e) => handleUpdate("description", e.target.value)}
                  placeholder="Brief description of this style..."
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/50 transition-colors"
                />
              </div>

              <LibraryField
                label="Style Rules"
                placeholder="Tone, voice, sentence length, perspective, formality level..."
                value={selected.styleRules}
                onChange={(v) => handleUpdate("styleRules", v)}
              />

              <LibraryField
                label="Reference Samples"
                placeholder="Paste examples of writing in this style..."
                value={selected.referenceSamples}
                onChange={(v) => handleUpdate("referenceSamples", v)}
              />

              <LibraryField
                label="Vocabulary"
                placeholder="Preferred words, phrases to use or avoid..."
                value={selected.vocabulary}
                onChange={(v) => handleUpdate("vocabulary", v)}
              />

              <LibraryField
                label="Structure Notes"
                placeholder="Formatting patterns, paragraph structure, content flow..."
                value={selected.structureNotes}
                onChange={(v) => handleUpdate("structureNotes", v)}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Pick a library from the left to configure it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LibraryField({
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
    <div>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 resize-y outline-none focus:border-accent/50 transition-colors leading-relaxed"
      />
    </div>
  );
}
