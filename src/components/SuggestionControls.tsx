"use client";

import { Editor } from "@tiptap/core";
import { useEffect, useState, useCallback } from "react";

interface SuggestionInfo {
  id: string;
  element: HTMLElement;
}

interface SuggestionControlsProps {
  editor: Editor;
}

export function SuggestionControls({ editor }: SuggestionControlsProps) {
  const [suggestions, setSuggestions] = useState<SuggestionInfo[]>([]);

  // Scan the DOM for suggestion marks and track them
  const scanSuggestions = useCallback(() => {
    const editorEl = editor.view.dom;
    const deleteMarks = editorEl.querySelectorAll("[data-suggestion-delete]");
    const seen = new Set<string>();
    const found: SuggestionInfo[] = [];

    deleteMarks.forEach((el) => {
      const id = el.getAttribute("data-suggestion-id");
      if (id && !seen.has(id)) {
        seen.add(id);
        found.push({ id, element: el as HTMLElement });
      }
    });

    setSuggestions(found);
  }, [editor]);

  useEffect(() => {
    // Scan on mount and on every transaction
    scanSuggestions();
    const handler = () => {
      // Use requestAnimationFrame to let DOM settle
      requestAnimationFrame(scanSuggestions);
    };
    editor.on("transaction", handler);
    return () => {
      editor.off("transaction", handler);
    };
  }, [editor, scanSuggestions]);

  const acceptSuggestion = useCallback(
    (suggestionId: string) => {
      const { tr } = editor.state;
      const doc = tr.doc;
      // We need to:
      // 1. Remove all suggestionDelete marks and their text
      // 2. Remove suggestionAdd marks but keep their text

      // Collect ranges to process (reverse order to maintain positions)
      const deletions: { from: number; to: number }[] = [];
      const additionMarks: { from: number; to: number }[] = [];

      doc.descendants((node, pos) => {
        if (node.isText) {
          const deleteMarkType = editor.schema.marks.suggestionDelete;
          const addMarkType = editor.schema.marks.suggestionAdd;

          const deleteMark = deleteMarkType
            ? node.marks.find(
                (m) =>
                  m.type === deleteMarkType &&
                  m.attrs.suggestionId === suggestionId
              )
            : null;

          const addMark = addMarkType
            ? node.marks.find(
                (m) =>
                  m.type === addMarkType &&
                  m.attrs.suggestionId === suggestionId
              )
            : null;

          if (deleteMark) {
            deletions.push({ from: pos, to: pos + node.nodeSize });
          }
          if (addMark) {
            additionMarks.push({ from: pos, to: pos + node.nodeSize });
          }
        }
      });

      // Process in reverse order to maintain positions
      // First: remove the add marks (keep text)
      const chain = editor.chain();

      // Remove addition marks
      additionMarks.reverse().forEach(({ from, to }) => {
        chain.command(({ tr }) => {
          const markType = editor.schema.marks.suggestionAdd;
          if (markType) {
            tr.removeMark(from, to, markType);
          }
          return true;
        });
      });

      // Delete the deletion-marked text
      deletions.reverse().forEach(({ from, to }) => {
        chain.command(({ tr }) => {
          tr.delete(from, to);
          return true;
        });
      });

      chain.run();
    },
    [editor]
  );

  const rejectSuggestion = useCallback(
    (suggestionId: string) => {
      const { tr } = editor.state;
      const doc = tr.doc;
      // Reject = opposite of accept:
      // 1. Remove all suggestionAdd marks and their text
      // 2. Remove suggestionDelete marks but keep their text

      const additions: { from: number; to: number }[] = [];
      const deleteMarks: { from: number; to: number }[] = [];

      doc.descendants((node, pos) => {
        if (node.isText) {
          const deleteMarkType = editor.schema.marks.suggestionDelete;
          const addMarkType = editor.schema.marks.suggestionAdd;

          const deleteMark = deleteMarkType
            ? node.marks.find(
                (m) =>
                  m.type === deleteMarkType &&
                  m.attrs.suggestionId === suggestionId
              )
            : null;

          const addMark = addMarkType
            ? node.marks.find(
                (m) =>
                  m.type === addMarkType &&
                  m.attrs.suggestionId === suggestionId
              )
            : null;

          if (addMark) {
            additions.push({ from: pos, to: pos + node.nodeSize });
          }
          if (deleteMark) {
            deleteMarks.push({ from: pos, to: pos + node.nodeSize });
          }
        }
      });

      const chain = editor.chain();

      // Remove delete marks (keep text, it's the original)
      deleteMarks.reverse().forEach(({ from, to }) => {
        chain.command(({ tr }) => {
          const markType = editor.schema.marks.suggestionDelete;
          if (markType) {
            tr.removeMark(from, to, markType);
          }
          return true;
        });
      });

      // Delete the addition text
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

  if (suggestions.length === 0) return null;

  return (
    <div className="suggestion-controls-container">
      {suggestions.map((s) => (
        <SuggestionTooltip
          key={s.id}
          suggestionId={s.id}
          element={s.element}
          onAccept={() => acceptSuggestion(s.id)}
          onReject={() => rejectSuggestion(s.id)}
        />
      ))}
    </div>
  );
}

function SuggestionTooltip({
  suggestionId,
  element,
  onAccept,
  onReject,
}: {
  suggestionId: string;
  element: HTMLElement;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    const updatePosition = () => {
      // Find the last add element for this suggestion to place buttons after it
      const container = element.closest(".tiptap");
      if (!container) return;

      const addEls = container.querySelectorAll(
        `[data-suggestion-add][data-suggestion-id="${suggestionId}"]`
      );
      const lastAdd =
        addEls.length > 0 ? addEls[addEls.length - 1] : element;
      const rect = lastAdd.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      setPosition({
        top: rect.top - containerRect.top + rect.height / 2,
        left: rect.right - containerRect.left + 4,
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [element, suggestionId]);

  if (!position) return null;

  return (
    <div
      className="suggestion-tooltip"
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        transform: "translateY(-50%)",
      }}
    >
      <button
        onClick={onAccept}
        className="suggestion-btn suggestion-btn-accept"
        title="Accept suggestion"
      >
        ✓
      </button>
      <button
        onClick={onReject}
        className="suggestion-btn suggestion-btn-reject"
        title="Reject suggestion"
      >
        ✗
      </button>
    </div>
  );
}
