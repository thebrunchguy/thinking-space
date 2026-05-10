"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { Document } from "@/lib/documents";
import { Library } from "@/lib/libraries";
import { SuggestionDelete, SuggestionAdd } from "@/extensions/suggestion";
import { SuggestionControls } from "./SuggestionControls";

type ChatMode = "improve" | "transition" | "quick";

interface ChatSelection {
  text: string;
  sectionText: string;
  from: number;
  to: number;
  mode: ChatMode;
  quickRewrite?: string;
}

interface Section {
  id: string;
  title: string;
  level: number;
  pos: number;
}

interface EditorProps {
  document: Document;
  onUpdate: (updates: Partial<Document>) => void;
  libraries?: Library[];
  instructions?: string;
  focusMode?: boolean;
  tocOpen?: boolean;
  onOpenChat?: (selection: ChatSelection) => void;
  onSaveNote?: (text: string, sectionName: string) => void;
  onSuggestionFeedback?: (aiSuggested: string, userEdited: string) => void;
  chatSelection?: ChatSelection | null;
  pendingSuggestion?: string | null;
  onSuggestionApplied?: () => void;
}

let suggestionCounter = 0;
function nextSuggestionId() {
  return `suggestion-${Date.now()}-${++suggestionCounter}`;
}

export type { ChatSelection, ChatMode };

export function Editor({ document, onUpdate, libraries = [], instructions = "", focusMode = false, tocOpen = true, onOpenChat, onSaveNote, onSuggestionFeedback, chatSelection, pendingSuggestion, onSuggestionApplied }: EditorProps) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const isInternalUpdate = useRef(false);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [hasSuggestions, setHasSuggestions] = useState(false);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [sections, setSections] = useState<Section[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollSnapping = useRef(false);

  const editor = useEditor(
    {
      immediatelyRender: false,
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

  // Get the text of the section containing a given position
  const getSectionText = useCallback(
    (pos: number): string => {
      if (!editor) return "";
      // Find the heading before `pos` and the heading after `pos`
      let sectionStart = 0;
      let sectionEnd = editor.state.doc.content.size;

      editor.state.doc.descendants((node, nodePos) => {
        if (node.type.name === "heading" && node.attrs.level <= 3) {
          if (nodePos < pos) {
            sectionStart = nodePos;
          } else if (nodePos >= pos && nodePos < sectionEnd && nodePos > sectionStart) {
            sectionEnd = nodePos;
            return false;
          }
        }
      });

      return editor.state.doc.textBetween(sectionStart, sectionEnd, "\n");
    },
    [editor]
  );

  const requestSuggestion = useCallback(async () => {
    if (!editor) return;

    const { from, to } = editor.state.selection;
    if (from === to) return;

    const selectedText = editor.state.doc.textBetween(from, to, " ");
    if (!selectedText.trim()) return;

    const fullDocument = editor.state.doc.textContent;

    // Open sidebar immediately in loading state
    const sectionText = getSectionText(from);
    onOpenChat?.({ text: selectedText, sectionText, from, to, mode: "quick" });
    editor.commands.setTextSelection(to);
    window.getSelection()?.removeAllRanges();

    setIsLoadingSuggestion(true);

    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText,
          fullDocument,
          libraries: libraries.map((l) => ({
            name: l.name,
            styleRules: l.styleRules,
            referenceSamples: l.referenceSamples,
            vocabulary: l.vocabulary,
            structureNotes: l.structureNotes,
            generatedOverview: l.generatedOverview,
            exampleFiles: l.exampleFiles?.map((f) => ({ name: f.name, content: f.content })) || [],
            feedback: l.feedback?.map((f) => ({ aiSuggested: f.aiSuggested, userEdited: f.userEdited })) || [],
          })),
          instructions,
        }),
      });

      if (!res.ok) {
        console.error("Suggestion error");
        return;
      }

      const { original, suggested } = await res.json();
      if (original === suggested) return;

      // Send rewrite to sidebar
      onOpenChat?.({ text: selectedText, sectionText, from, to, mode: "quick", quickRewrite: suggested });
    } catch (err) {
      console.error("Failed to get suggestion:", err);
    } finally {
      setIsLoadingSuggestion(false);
    }
  }, [editor, libraries, instructions, onOpenChat]);

  // Cmd+J keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        requestSuggestion();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (!editor) return;
        const { from, to } = editor.state.selection;
        if (from === to) return;
        const selectedText = editor.state.doc.textBetween(from, to, "\n");
        if (!selectedText.trim()) return;

        // Detect transition: selection spans multiple paragraphs with a break/divider
        let blockCount = 0;
        editor.state.doc.nodesBetween(from, to, (node) => {
          if (node.isBlock && node.isTextblock) blockCount++;
        });
        const hasBreak = /\n\s*[—–-]{1,3}\s*\n/.test(selectedText) || blockCount >= 3;
        const mode: ChatMode = hasBreak ? "transition" : "improve";
        const sectionCtx = getSectionText(from);

        onOpenChat?.({ text: selectedText, sectionText: sectionCtx, from, to, mode });
        editor.commands.setTextSelection(to);
        window.getSelection()?.removeAllRanges();
      }
      // Cmd+M: cut selected text and save as note
      if ((e.metaKey || e.ctrlKey) && e.key === "m") {
        e.preventDefault();
        if (!editor) return;
        const { from, to } = editor.state.selection;
        if (from === to) return;
        const selectedText = editor.state.doc.textBetween(from, to, "\n");
        if (!selectedText.trim()) return;

        // Find the nearest heading above the selection
        let sectionName = "";
        editor.state.doc.nodesBetween(0, from, (node) => {
          if (node.type.name === "heading" && node.attrs.level <= 3) {
            sectionName = node.textContent;
          }
        });

        editor.chain().focus().deleteSelection().run();
        onSaveNote?.(selectedText, sectionName);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestSuggestion, editor, onOpenChat, onSaveNote, getSectionText]);

  // Apply suggestion from chat panel
  const applyChatSuggestion = useCallback(
    (suggestedText: string) => {
      if (!editor || !chatSelection) return;

      const { from, to, mode } = chatSelection;
      const suggestionId = nextSuggestionId();

      if (mode === "transition") {
        // For transitions, find the divider/break node and only replace that
        let dividerFrom = -1;
        let dividerTo = -1;

        editor.state.doc.nodesBetween(from, to, (node, pos) => {
          if (dividerFrom !== -1) return false; // already found
          if (!node.isTextblock) return;
          const text = node.textContent.trim();
          // Match divider patterns: em dash, en dash, hyphens, hr-like
          if (/^[—–\-]{1,3}$/.test(text)) {
            dividerFrom = pos;
            dividerTo = pos + node.nodeSize;
          }
        });

        if (dividerFrom !== -1) {
          // Replace only the divider node
          editor
            .chain()
            .command(({ tr }) => {
              const deleteMarkType = editor.schema.marks.suggestionDelete;
              if (deleteMarkType) {
                // Mark the divider text content as delete
                const contentFrom = dividerFrom + 1; // skip into the paragraph node
                const contentTo = dividerTo - 1;
                if (contentFrom < contentTo) {
                  tr.addMark(contentFrom, contentTo, deleteMarkType.create({ suggestionId }));
                }
              }
              return true;
            })
            .command(({ tr }) => {
              const addMarkType = editor.schema.marks.suggestionAdd;
              if (addMarkType) {
                const mark = addMarkType.create({ suggestionId });
                const textNode = editor.schema.text(suggestedText, [mark]);
                tr.insert(dividerTo - 1, textNode);
              }
              return true;
            })
            .run();
        } else {
          // No divider found — fall back to full range replacement
          editor
            .chain()
            .command(({ tr }) => {
              const deleteMarkType = editor.schema.marks.suggestionDelete;
              if (deleteMarkType) {
                tr.addMark(from, to, deleteMarkType.create({ suggestionId }));
              }
              return true;
            })
            .command(({ tr }) => {
              const addMarkType = editor.schema.marks.suggestionAdd;
              if (addMarkType) {
                const mark = addMarkType.create({ suggestionId });
                const textNode = editor.schema.text(suggestedText, [mark]);
                tr.insert(to, textNode);
              }
              return true;
            })
            .run();
        }
      } else {
        // Improve mode: mark entire selection as delete, insert after
        editor
          .chain()
          .command(({ tr }) => {
            const deleteMarkType = editor.schema.marks.suggestionDelete;
            if (deleteMarkType) {
              tr.addMark(from, to, deleteMarkType.create({ suggestionId }));
            }
            return true;
          })
          .command(({ tr }) => {
            const addMarkType = editor.schema.marks.suggestionAdd;
            if (addMarkType) {
              const mark = addMarkType.create({ suggestionId });
              const textNode = editor.schema.text(suggestedText, [mark]);
              tr.insert(to, textNode);
            }
            return true;
          })
          .run();
      }
    },
    [editor, chatSelection]
  );

  // Apply pending suggestion from chat panel
  useEffect(() => {
    if (pendingSuggestion && chatSelection && editor) {
      applyChatSuggestion(pendingSuggestion);
      onSuggestionApplied?.();
    }
  }, [pendingSuggestion, chatSelection, editor, applyChatSuggestion, onSuggestionApplied]);

  // Track whether suggestions exist to show/hide sidebar
  useEffect(() => {
    const check = () => {
      const el = editor?.view?.dom;
      if (!el) return;
      setHasSuggestions(
        el.querySelectorAll("[data-suggestion-delete]").length > 0 ||
        el.querySelectorAll("[data-suggestion-add]").length > 0
      );
    };
    check();
    editor?.on("transaction", check);
    return () => { editor?.off("transaction", check); };
  }, [editor]);

  // Parse sections from editor content
  useEffect(() => {
    if (!editor) return;
    const parseSections = () => {
      const newSections: Section[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading" && node.attrs.level <= 3) {
          newSections.push({
            id: `section-${pos}`,
            title: node.textContent || "Untitled section",
            level: node.attrs.level,
            pos,
          });
        }
      });
      // Add "Top notes" if content exists before first heading
      if (newSections.length > 0 && newSections[0].pos > 1) {
        newSections.unshift({
          id: "section-top",
          title: "Top notes",
          level: 0,
          pos: 0,
        });
      } else if (newSections.length === 0) {
        newSections.push({
          id: "section-top",
          title: "Top notes",
          level: 0,
          pos: 0,
        });
      }
      setSections(newSections);
    };
    parseSections();
    editor.on("update", parseSections);
    return () => { editor.off("update", parseSections); };
  }, [editor]);

  // In focus mode, scroll to section when clicking TOC
  const scrollToSection = useCallback(
    (index: number) => {
      if (!editor || !scrollContainerRef.current) return;
      // Suppress snap handler during TOC-initiated scroll
      isScrollSnapping.current = true;
      setActiveSectionIndex(index);
      const section = sections[index];
      if (!section) return;

      if (section.pos === 0) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: "instant" });
        setTimeout(() => { isScrollSnapping.current = false; }, 300);
      } else {
        // Wait two frames so focus-mode CSS (padding/margins) is fully painted before measuring
        requestAnimationFrame(() => { requestAnimationFrame(() => {
          try {
            const domPos = editor.view.domAtPos(section.pos + 1);
            const element = domPos.node instanceof HTMLElement
              ? domPos.node
              : domPos.node.parentElement;
            if (element) {
              const heading = element.closest("h1, h2, h3") || element;
              const container = scrollContainerRef.current!;
              const headingRect = heading.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();
              const offset = headingRect.top - containerRect.top + container.scrollTop - 80;
              container.scrollTo({ top: Math.max(0, offset), behavior: "instant" });
            }
          } catch {
            // fallback
          }
          setTimeout(() => { isScrollSnapping.current = false; }, 300);
        }); });
        return;
      }
    },
    [editor, sections]
  );

  // In focus mode, detect which section is in view on scroll
  useEffect(() => {
    if (!focusMode || !editor || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    let ticking = false;

    const onScroll = () => {
      if (ticking || isScrollSnapping.current) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        // Find which section heading is closest to the top of the viewport
        const containerRect = container.getBoundingClientRect();
        let closestIndex = 0;
        let closestDistance = Infinity;

        sections.forEach((section, i) => {
          if (section.pos === 0) {
            // Top notes — distance is scroll position
            const dist = Math.abs(container.scrollTop);
            if (dist < closestDistance) {
              closestDistance = dist;
              closestIndex = i;
            }
            return;
          }
          try {
            const domPos = editor.view.domAtPos(section.pos + 1);
            const element = domPos.node instanceof HTMLElement
              ? domPos.node
              : domPos.node.parentElement;
            if (element) {
              const heading = element.closest("h1, h2, h3") || element;
              const rect = heading.getBoundingClientRect();
              const dist = Math.abs(rect.top - containerRect.top - 80);
              if (dist < closestDistance) {
                closestDistance = dist;
                closestIndex = i;
              }
            }
          } catch {
            // skip
          }
        });

        setActiveSectionIndex(closestIndex);
      });
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [focusMode, editor, sections]);

  // Snap scrolling in focus mode
  useEffect(() => {
    if (!focusMode || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    let scrollTimeout: ReturnType<typeof setTimeout>;

    const onScrollEnd = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (isScrollSnapping.current) return;
        isScrollSnapping.current = true;

        // Snap to the nearest section
        const section = sections[activeSectionIndex];
        if (section && editor) {
          if (section.pos === 0) {
            container.scrollTo({ top: 0, behavior: "smooth" });
          } else {
            try {
              const domPos = editor.view.domAtPos(section.pos + 1);
              const element = domPos.node instanceof HTMLElement
                ? domPos.node
                : domPos.node.parentElement;
              if (element) {
                const heading = element.closest("h1, h2, h3") || element;
                heading.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            } catch {
              // skip
            }
          }
        }

        setTimeout(() => { isScrollSnapping.current = false; }, 500);
      }, 150);
    };

    container.addEventListener("scroll", onScrollEnd, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScrollEnd);
      clearTimeout(scrollTimeout);
    };
  }, [focusMode, activeSectionIndex, sections, editor]);

  // Track which child indices are in the active section
  const [activeChildRange, setActiveChildRange] = useState<[number, number]>([0, 0]);

  useEffect(() => {
    if (!editor || !focusMode || sections.length === 0) {
      setActiveChildRange([0, 0]);
      return;
    }

    const computeRange = () => {
      const editorDom = editor.view.dom;
      const children = Array.from(editorDom.children);
      const headingTags = new Set(["H1", "H2", "H3"]);
      const hasTopNotes = sections.length > 0 && sections[0].level === 0;
      let currentSectionIndex = hasTopNotes ? 0 : -1;
      let headingCounter = 0;
      let start = -1;
      let end = children.length;

      children.forEach((child, i) => {
        if (headingTags.has(child.tagName)) {
          const sectionIdx = hasTopNotes ? headingCounter + 1 : headingCounter;
          currentSectionIndex = sectionIdx;
          headingCounter++;
        }
        if (currentSectionIndex === activeSectionIndex) {
          if (start === -1) start = i;
          end = i + 1;
        }
      });

      if (start === -1) start = 0;
      setActiveChildRange([start, end]);
    };

    computeRange();
    editor.on("update", computeRange);
    return () => { editor.off("update", computeRange); };
  }, [editor, focusMode, activeSectionIndex, sections]);

  // Generate CSS that dims/spaces non-active children via nth-child
  const focusCSSRules = useMemo(() => {
    if (!focusMode || sections.length === 0) return "";
    const [start, end] = activeChildRange;
    if (start === end) return "";

    let css = `
      .tiptap.focus-active {
        padding-bottom: 70vh !important;
      }
      .tiptap.focus-active > * {
        opacity: 0.12 !important;
        transition: opacity 0.3s ease !important;
      }
      .tiptap.focus-active > *:hover {
        opacity: 0.3 !important;
      }
      .tiptap.focus-active > :is(h1, h2, h3) {
        margin-top: 8rem !important;
        padding-top: 2rem !important;
      }
    `;

    // Un-dim the active range
    for (let i = start; i < end; i++) {
      css += `.tiptap.focus-active > *:nth-child(${i + 1}) { opacity: 1 !important; margin-top: revert !important; padding-top: revert !important; }\n`;
    }
    // Add breathing room above the first element of the active section
    css += `.tiptap.focus-active > *:nth-child(${start + 1}) { padding-top: 3rem !important; }\n`;

    return css;
  }, [focusMode, sections, activeChildRange]);

  // Toggle .focus-active class on the editor DOM (single class, TipTap won't wipe it)
  useEffect(() => {
    if (!editor) return;
    const editorDom = editor.view.dom;
    if (focusMode && sections.length > 0) {
      editorDom.classList.add("focus-active");
    } else {
      editorDom.classList.remove("focus-active");
    }
    return () => { editorDom.classList.remove("focus-active"); };
  }, [editor, focusMode, sections]);

  if (!editor) return null;

  return (
    <div className="flex-1 flex min-h-0">
      {/* Dynamic focus mode styles */}
      {focusCSSRules && <style dangerouslySetInnerHTML={{ __html: focusCSSRules }} />}

      {/* TOC panel — between sidebar and editor in focus mode */}
      {focusMode && tocOpen && sections.length > 0 && (
        <div className="w-48 flex-shrink-0 border-r border-border/30 overflow-y-auto py-4 px-2">
          <div className="space-y-0.5">
            {sections.map((section, i) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(i)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors truncate flex items-center gap-1.5 ${
                  activeSectionIndex === i
                    ? "text-foreground bg-muted"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                style={{ paddingLeft: `${(section.level === 0 ? 0 : (section.level - 1)) * 12 + 8}px` }}
              >
                <span className={`inline-block w-1 h-1 rounded-full flex-shrink-0 ${
                  activeSectionIndex === i ? "bg-foreground" : "bg-muted-foreground/40"
                }`} />
                <span className="truncate">{section.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editor content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto w-full px-6 py-8 md:px-8 md:py-12">
          {/* Title */}
          <textarea
            ref={titleRef}
            value={document.title}
            onChange={handleTitleChange}
            onKeyDown={handleTitleKeyDown}
            placeholder="Untitled"
            className="w-full text-4xl md:text-5xl font-bold bg-transparent border-none outline-none resize-none overflow-hidden placeholder:text-muted-foreground/40 leading-tight mb-6"
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
        </div>

      </div>

      {/* Right suggestion sidebar */}
      {hasSuggestions && (
        <SuggestionControls editor={editor} onFeedback={onSuggestionFeedback} />
      )}
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
