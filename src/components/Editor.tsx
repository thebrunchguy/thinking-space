"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { useEffect, useRef, useCallback, useState } from "react";
import { Document } from "@/lib/documents";
import { DocumentContext } from "@/lib/context";
import { SuggestionDelete, SuggestionAdd } from "@/extensions/suggestion";
import { SuggestionControls } from "./SuggestionControls";

interface EditorProps {
  document: Document;
  onUpdate: (updates: Partial<Document>) => void;
  context?: DocumentContext;
}

let suggestionCounter = 0;
function nextSuggestionId() {
  return `suggestion-${Date.now()}-${++suggestionCounter}`;
}

export function Editor({ document, onUpdate, context }: EditorProps) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const isInternalUpdate = useRef(false);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Placeholder.configure({
          placeholder: "Start writing...",
        }),
        Highlight,
        Underline,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: "text-accent underline",
          },
        }),
        SuggestionDelete,
        SuggestionAdd,
      ],
      content: document.content,
      editorProps: {
        attributes: {
          class: "prose-editor focus:outline-none",
        },
      },
      onUpdate: ({ editor }) => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          onUpdate({ content: editor.getHTML() });
        }, 300);
      },
    },
    [document.id]
  );

  // Sync content when document changes
  useEffect(() => {
    if (editor && !isInternalUpdate.current) {
      const currentContent = editor.getHTML();
      if (currentContent !== document.content) {
        editor.commands.setContent(document.content || "");
      }
    }
    isInternalUpdate.current = false;
  }, [document.id, document.content, editor]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate({ title: e.target.value });
    },
    [onUpdate]
  );

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        editor?.commands.focus("start");
      }
    },
    [editor]
  );

  // Auto-resize title
  useEffect(() => {
    const el = titleRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [document.title]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  }, [editor]);

  const requestSuggestion = useCallback(async () => {
    if (!editor) return;

    const { from, to } = editor.state.selection;
    if (from === to) return; // No selection

    const selectedText = editor.state.doc.textBetween(from, to, " ");
    if (!selectedText.trim()) return;

    const fullDocument = editor.state.doc.textContent;

    setIsLoadingSuggestion(true);

    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText,
          fullDocument,
          styleGuide: context?.styleGuide || "",
          referenceNotes: context?.referenceNotes || "",
          instructions: context?.instructions || "",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        console.error("Suggestion error:", err.error);
        return;
      }

      const { original, suggested } = await res.json();

      if (original === suggested) return; // No changes

      const suggestionId = nextSuggestionId();

      // Apply the suggestion as inline marks:
      // 1. Mark the selected (original) text as "delete"
      // 2. Insert the suggested text right after with "add" mark
      editor
        .chain()
        .command(({ tr }) => {
          // Mark original text as deletion
          const deleteMarkType = editor.schema.marks.suggestionDelete;
          if (deleteMarkType) {
            tr.addMark(
              from,
              to,
              deleteMarkType.create({ suggestionId })
            );
          }
          return true;
        })
        .command(({ tr }) => {
          // Insert suggested text after the original, with add mark
          const addMarkType = editor.schema.marks.suggestionAdd;
          if (addMarkType) {
            const mark = addMarkType.create({ suggestionId });
            const textNode = editor.schema.text(suggested, [mark]);
            tr.insert(to, textNode);
          }
          return true;
        })
        .run();
    } catch (err) {
      console.error("Failed to get suggestion:", err);
    } finally {
      setIsLoadingSuggestion(false);
    }
  }, [editor, context]);

  if (!editor) return null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[720px] mx-auto px-6 py-8 md:px-8 md:py-12 relative">
        {/* Title */}
        <textarea
          ref={titleRef}
          value={document.title}
          onChange={handleTitleChange}
          onKeyDown={handleTitleKeyDown}
          placeholder="Untitled"
          className="w-full text-4xl md:text-5xl font-bold bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground/40 leading-tight mb-6"
          rows={1}
        />

        {/* Bubble Menu */}
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-0.5 bg-surface border border-border rounded-lg shadow-lg px-1 py-1"
        >
          <BubbleButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive("bold")}
            title="Bold"
          >
            <span className="font-bold text-sm">B</span>
          </BubbleButton>
          <BubbleButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive("italic")}
            title="Italic"
          >
            <span className="italic text-sm">I</span>
          </BubbleButton>
          <BubbleButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive("underline")}
            title="Underline"
          >
            <span className="underline text-sm">U</span>
          </BubbleButton>
          <BubbleButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive("strike")}
            title="Strikethrough"
          >
            <span className="line-through text-sm">S</span>
          </BubbleButton>
          <div className="w-px h-5 bg-border mx-0.5" />
          <BubbleButton
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            isActive={editor.isActive("heading", { level: 2 })}
            title="Heading"
          >
            <span className="text-sm font-semibold">H</span>
          </BubbleButton>
          <BubbleButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive("blockquote")}
            title="Quote"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
              <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
            </svg>
          </BubbleButton>
          <BubbleButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive("code")}
            title="Code"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </BubbleButton>
          <BubbleButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            isActive={editor.isActive("highlight")}
            title="Highlight"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 11-6 6v3h9l3-3" />
              <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
            </svg>
          </BubbleButton>
          <div className="w-px h-5 bg-border mx-0.5" />
          <BubbleButton
            onClick={setLink}
            isActive={editor.isActive("link")}
            title="Link"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </BubbleButton>
          <div className="w-px h-5 bg-border mx-0.5" />
          {/* AI Suggest Button */}
          <BubbleButton
            onClick={requestSuggestion}
            isActive={false}
            title="AI Suggest (⌘+J)"
            disabled={isLoadingSuggestion}
          >
            {isLoadingSuggestion ? (
              <span className="text-sm animate-pulse">⏳</span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4" />
                <path d="m6.34 6.34 2.83 2.83" />
                <path d="M2 12h4" />
                <path d="m6.34 17.66 2.83-2.83" />
                <path d="M12 18v4" />
                <path d="m17.66 17.66-2.83-2.83" />
                <path d="M18 12h4" />
                <path d="m17.66 6.34-2.83 2.83" />
              </svg>
            )}
          </BubbleButton>
        </BubbleMenu>

        {/* Editor Content */}
        <EditorContent editor={editor} />

        {/* Suggestion accept/reject controls */}
        <SuggestionControls editor={editor} />
      </div>
    </div>
  );
}

function BubbleButton({
  onClick,
  isActive,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  isActive: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded-md transition-colors ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : isActive
            ? "bg-accent text-accent-foreground"
            : "hover:bg-muted text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
