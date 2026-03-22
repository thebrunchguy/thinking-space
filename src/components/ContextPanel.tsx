"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  DocumentContext,
  loadDocumentContext,
  saveDocumentContext,
  estimateTokens,
} from "@/lib/context";

interface ContextPanelProps {
  docId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ContextPanel({ docId, isOpen, onClose }: ContextPanelProps) {
  const [context, setContext] = useState<DocumentContext>({
    styleGuide: "",
    referenceNotes: "",
    instructions: "",
  });
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Load context when document changes
  useEffect(() => {
    setContext(loadDocumentContext(docId));
  }, [docId]);

  const updateField = useCallback(
    (field: keyof DocumentContext, value: string) => {
      setContext((prev) => {
        const next = { ...prev, [field]: value };
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          saveDocumentContext(docId, next);
        }, 300);
        return next;
      });
    },
    [docId]
  );

  const totalTokens =
    estimateTokens(context.styleGuide) +
    estimateTokens(context.referenceNotes) +
    estimateTokens(context.instructions);

  return (
    <aside
      className={`fixed lg:relative z-40 top-0 right-0 h-full w-80 bg-surface border-l border-border flex flex-col transition-transform duration-200 ease-in-out ${
        isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-full"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Context
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Close context panel"
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
        </button>
      </div>

      {/* Context fields */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <ContextField
          label="Style Guide"
          placeholder="e.g. Write in first person, conversational tone, avoid jargon..."
          value={context.styleGuide}
          onChange={(v) => updateField("styleGuide", v)}
          rows={4}
        />

        <ContextField
          label="Reference Notes"
          placeholder="Paste background info, research, talking points..."
          value={context.referenceNotes}
          onChange={(v) => updateField("referenceNotes", v)}
          rows={6}
        />

        <ContextField
          label="Instructions"
          placeholder="e.g. Make this more concise, add more detail..."
          value={context.instructions}
          onChange={(v) => updateField("instructions", v)}
          rows={3}
        />
      </div>

      {/* Token count footer */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Context tokens</span>
          <span
            className={`text-xs font-mono ${
              totalTokens > 2000
                ? "text-amber-500"
                : "text-muted-foreground"
            }`}
          >
            ~{totalTokens.toLocaleString()}
          </span>
        </div>
      </div>
    </aside>
  );
}

function ContextField({
  label,
  placeholder,
  value,
  onChange,
  rows,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
}) {
  const tokens = estimateTokens(value);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </label>
        {tokens > 0 && (
          <span className="text-[10px] text-muted-foreground font-mono">
            ~{tokens}
          </span>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 resize-y outline-none focus:border-accent/50 transition-colors leading-relaxed"
      />
    </div>
  );
}

/**
 * Hook to get the current document context for use in other components.
 */
export function useDocumentContext(docId: string | null): DocumentContext {
  const [context, setContext] = useState<DocumentContext>({
    styleGuide: "",
    referenceNotes: "",
    instructions: "",
  });

  useEffect(() => {
    if (!docId) return;
    setContext(loadDocumentContext(docId));

    // Listen for storage changes (in case context panel updates)
    const handler = (e: StorageEvent) => {
      if (e.key === `thinking-space-context-${docId}`) {
        setContext(loadDocumentContext(docId));
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [docId]);

  return context;
}
