"use client";

import { Document } from "@/lib/documents";

interface SidebarProps {
  documents: Document[];
  activeDocId: string | null;
  isOpen: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function Sidebar({
  documents,
  activeDocId,
  isOpen,
  onSelect,
  onNew,
  onDelete,
}: SidebarProps) {
  return (
    <aside
      className={`fixed lg:relative z-40 top-0 left-0 h-full w-72 bg-surface border-r border-border flex flex-col transition-transform duration-200 ease-in-out ${
        isOpen ? "translate-x-0" : "-translate-x-full lg:-translate-x-full"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Documents
        </h2>
        <button
          onClick={onNew}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="New document"
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
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto py-2">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className={`group flex items-center gap-2 px-4 py-2.5 cursor-pointer transition-colors ${
              doc.id === activeDocId
                ? "bg-muted"
                : "hover:bg-muted/50"
            }`}
            onClick={() => onSelect(doc.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {doc.title || "Untitled"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(doc.updatedAt)}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Delete this document?")) {
                  onDelete(doc.id);
                }
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-border transition-all text-muted-foreground hover:text-foreground"
              title="Delete"
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
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-xs text-muted-foreground">
          {documents.length} document{documents.length !== 1 ? "s" : ""}
        </p>
      </div>
    </aside>
  );
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
