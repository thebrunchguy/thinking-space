"use client";

import { Editor } from "@tiptap/core";
import { useEffect, useState, useCallback, useRef } from "react";

interface SuggestionData {
  id: string;
  originalText: string;
  suggestedText: string;
}

interface SuggestionControlsProps {
  editor: Editor;
  onFeedback?: (aiSuggested: string, userEdited: string) => void;
}

export function SuggestionControls({ editor, onFeedback }: SuggestionControlsProps) {
  const [suggestions, setSuggestions] = useState<SuggestionData[]>([]);

  const scanSuggestions = useCallback(() => {
    const editorEl = editor.view.dom;
    const seen = new Set<string>();
    const found: SuggestionData[] = [];

    const allMarked = editorEl.querySelectorAll("[data-suggestion-delete], [data-suggestion-add]");
    allMarked.forEach((el) => {
      const id = el.getAttribute("data-suggestion-id");
      if (!id || seen.has(id)) return;
      seen.add(id);

      const allDeletes = editorEl.querySelectorAll(
        `[data-suggestion-delete][data-suggestion-id="${id}"]`
      );
      let originalText = "";
      allDeletes.forEach((d) => (originalText += d.textContent || ""));

      const allAdds = editorEl.querySelectorAll(
        `[data-suggestion-add][data-suggestion-id="${id}"]`
      );
      let suggestedText = "";
      allAdds.forEach((a) => (suggestedText += a.textContent || ""));

      found.push({ id, originalText, suggestedText });
    });

    setSuggestions(found);
  }, [editor]);

  useEffect(() => {
    scanSuggestions();
    const handler = () => requestAnimationFrame(scanSuggestions);
    editor.on("transaction", handler);
    return () => { editor.off("transaction", handler); };
  }, [editor, scanSuggestions]);

  const acceptSuggestion = useCallback(
    (suggestionId: string, editedText?: string) => {
      const doc = editor.state.doc;
      const deletions: { from: number; to: number }[] = [];
      const additionMarks: { from: number; to: number }[] = [];

      doc.descendants((node, pos) => {
        if (!node.isText) return;
        const deleteMarkType = editor.schema.marks.suggestionDelete;
        const addMarkType = editor.schema.marks.suggestionAdd;

        if (deleteMarkType && node.marks.find((m) => m.type === deleteMarkType && m.attrs.suggestionId === suggestionId)) {
          deletions.push({ from: pos, to: pos + node.nodeSize });
        }
        if (addMarkType && node.marks.find((m) => m.type === addMarkType && m.attrs.suggestionId === suggestionId)) {
          additionMarks.push({ from: pos, to: pos + node.nodeSize });
        }
      });

      const chain = editor.chain();

      if (editedText !== undefined && additionMarks.length > 0) {
        // User edited the suggestion — replace the add-marked text with their version
        const firstFrom = Math.min(...additionMarks.map((m) => m.from));
        const lastTo = Math.max(...additionMarks.map((m) => m.to));

        chain.command(({ tr }) => {
          tr.replaceWith(firstFrom, lastTo, editor.schema.text(editedText));
          return true;
        });
      } else {
        // No edits — just remove the add marks (keep text as-is)
        additionMarks.reverse().forEach(({ from, to }) => {
          chain.command(({ tr }) => {
            const markType = editor.schema.marks.suggestionAdd;
            if (markType) tr.removeMark(from, to, markType);
            return true;
          });
        });
      }

      // Delete the original (red strikethrough) text
      // Need to re-scan positions after potential replacement
      chain.command(({ tr }) => {
        // Re-find deletions in the current transaction state
        const dels: { from: number; to: number }[] = [];
        tr.doc.descendants((node, pos) => {
          if (!node.isText) return;
          const deleteMarkType = editor.schema.marks.suggestionDelete;
          if (deleteMarkType && node.marks.find((m) => m.type === deleteMarkType && m.attrs.suggestionId === suggestionId)) {
            dels.push({ from: pos, to: pos + node.nodeSize });
          }
        });
        // Delete in reverse to preserve positions
        dels.reverse().forEach(({ from, to }) => {
          tr.delete(from, to);
        });
        return true;
      });

      chain.run();
    },
    [editor]
  );

  const rejectSuggestion = useCallback(
    (suggestionId: string) => {
      const doc = editor.state.doc;
      const additions: { from: number; to: number }[] = [];
      const deleteMarks: { from: number; to: number }[] = [];

      doc.descendants((node, pos) => {
        if (!node.isText) return;
        const deleteMarkType = editor.schema.marks.suggestionDelete;
        const addMarkType = editor.schema.marks.suggestionAdd;

        if (addMarkType && node.marks.find((m) => m.type === addMarkType && m.attrs.suggestionId === suggestionId)) {
          additions.push({ from: pos, to: pos + node.nodeSize });
        }
        if (deleteMarkType && node.marks.find((m) => m.type === deleteMarkType && m.attrs.suggestionId === suggestionId)) {
          deleteMarks.push({ from: pos, to: pos + node.nodeSize });
        }
      });

      const chain = editor.chain();
      deleteMarks.reverse().forEach(({ from, to }) => {
        chain.command(({ tr }) => {
          const markType = editor.schema.marks.suggestionDelete;
          if (markType) tr.removeMark(from, to, markType);
          return true;
        });
      });
      additions.reverse().forEach(({ from, to }) => {
        chain.command(({ tr }) => {
          tr.delete(from, to);
          return true;
        });
      });
      chain.run();
    },
    [editor]
  );

  const handleAccept = useCallback(
    (suggestion: SuggestionData, editedText: string) => {
      const wasEdited = editedText !== suggestion.suggestedText;

      if (wasEdited) {
        // Accept with the user's edited version
        acceptSuggestion(suggestion.id, editedText);
        // Record feedback for learning
        onFeedback?.(suggestion.suggestedText, editedText);
      } else {
        // Accept as-is
        acceptSuggestion(suggestion.id);
      }
    },
    [acceptSuggestion, onFeedback]
  );

  if (suggestions.length === 0) return null;

  return (
    <div className="w-72 flex-shrink-0 border-l border-border">
      <div className="p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Suggestions
          </h3>
          <span className="text-xs text-muted-foreground">
            {suggestions.length}
          </span>
        </div>
        {suggestions.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            onAccept={(editedText) => handleAccept(s, editedText)}
            onReject={() => rejectSuggestion(s.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
}: {
  suggestion: SuggestionData;
  onAccept: (editedText: string) => void;
  onReject: () => void;
}) {
  const [editedText, setEditedText] = useState(suggestion.suggestedText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasEdited = editedText !== suggestion.suggestedText;

  // Sync when suggestion changes
  useEffect(() => {
    setEditedText(suggestion.suggestedText);
  }, [suggestion.suggestedText]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [editedText]);

  return (
    <div className="mb-3 rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
      {/* Content */}
      <div className="px-3 py-2.5 text-sm leading-relaxed">
        {suggestion.originalText && (
          <span className="line-through text-red-500/80 decoration-red-400/60">
            {suggestion.originalText}
          </span>
        )}
        {suggestion.originalText && suggestion.suggestedText && (
          <div className="my-2 border-t border-border/30" />
        )}
        {suggestion.suggestedText && (
          <textarea
            ref={textareaRef}
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className={`w-full bg-transparent resize-none outline-none text-sm leading-relaxed ${
              wasEdited
                ? "text-accent"
                : "text-green-600 dark:text-green-400"
            }`}
            rows={1}
          />
        )}
        {wasEdited && (
          <p className="text-[10px] text-muted-foreground/60 mt-1">Edited from AI suggestion</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex border-t border-border/50">
        <button
          onClick={() => onAccept(editedText)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Accept
        </button>
        <div className="w-px bg-border/50" />
        <button
          onClick={onReject}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Reject
        </button>
      </div>
    </div>
  );
}
