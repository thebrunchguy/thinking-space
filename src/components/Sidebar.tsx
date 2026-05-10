"use client";

import Link from "next/link";
import { Document } from "@/lib/documents";
import { ThemeToggle } from "@/components/ThemeToggle";

interface SidebarProps {
  documents: Document[];
  activeDocId: string | null;
  isOpen: boolean;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onToggle: () => void;
}

export function Sidebar({
  documents,
  activeDocId,
  isOpen,
  focusMode,
  onToggleFocusMode,
  onSelect,
  onNew,
  onDelete,
  onToggle,
}: SidebarProps) {
  return (
    <div
      className={`flex-shrink-0 bg-sidebar flex flex-col transition-all duration-200 ease-in-out overflow-hidden ${
        isOpen ? "w-64" : "w-12"
      }`}
    >
      {/* Header — toggle + new doc */}
      <div className="flex items-center justify-between p-3">
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-sidebar-hover transition-colors text-sidebar-foreground/60 hover:text-sidebar-foreground"
          aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
        {isOpen && (
          <button
            onClick={onNew}
            className="p-2 rounded-lg hover:bg-sidebar-hover transition-colors text-sidebar-foreground/60 hover:text-sidebar-foreground"
            title="New document"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>

      {/* Document list — only when open */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className={`group flex items-center gap-2 px-3 py-2 mb-0.5 rounded-lg cursor-pointer transition-colors ${
                doc.id === activeDocId
                  ? "bg-sidebar-active text-sidebar-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-hover"
              }`}
              onClick={() => onSelect(doc.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">
                  {doc.title || "Untitled"}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this document?")) {
                    onDelete(doc.id);
                  }
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-sidebar-active transition-all text-sidebar-foreground/40 hover:text-sidebar-foreground"
                title="Delete"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* New doc button when collapsed */}
      {!isOpen && (
        <button
          onClick={onNew}
          className="mx-auto p-2 rounded-lg hover:bg-sidebar-hover transition-colors text-sidebar-foreground/60 hover:text-sidebar-foreground"
          title="New document"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}

      {/* Footer — theme toggle + focus mode + libraries */}
      <div className={`border-t border-sidebar-hover px-3 py-3 flex items-center ${isOpen ? "gap-1" : "flex-col gap-2"}`}>
        <ThemeToggle />
        <button
          onClick={onToggleFocusMode}
          className={`p-2 rounded-lg hover:bg-sidebar-hover transition-colors ${
            focusMode
              ? "text-accent"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
          }`}
          aria-label="Toggle focus mode"
          title={focusMode ? "Switch to full view" : "Switch to focus mode"}
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
            className={`transition-transform duration-300 ${focusMode ? "rotate-180" : ""}`}
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
          </svg>
        </button>
        <Link
          href="/libraries"
          className="p-2 rounded-lg hover:bg-sidebar-hover transition-colors text-sidebar-foreground/60 hover:text-sidebar-foreground"
          aria-label="Manage libraries"
          title="Libraries"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
