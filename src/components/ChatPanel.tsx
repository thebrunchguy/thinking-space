"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Library } from "@/lib/libraries";

type Category = "general" | "cleanup" | "structural";
type ChatMode = "improve" | "transition" | "quick" | "chat";
type Phase = "empty" | "diagnosing" | "selecting" | "rewriting" | "done" | "chatting" | "chat-responding";

// --- Improve mode types ---
interface Improvement {
  title: string;
  description: string;
  category: Category;
  checked: boolean;
}

const IMPROVE_CATEGORIES: Record<Category, { label: string; color: string; dotColor: string }> = {
  general: { label: "General", color: "text-blue-400", dotColor: "bg-blue-400" },
  cleanup: { label: "Clean Up", color: "text-amber-400", dotColor: "bg-amber-400" },
  structural: { label: "Structural", color: "text-purple-400", dotColor: "bg-purple-400" },
};

// --- Transition mode types ---
interface TransitionApproach {
  title: string;
  description: string;
  examples: string[];
  checked: boolean;
}

type ContextScope = "document" | "section" | "selection";

interface ChatPanelProps {
  selectedText: string;
  currentSelectedText?: string;
  fullDocument: string;
  sectionText: string;
  libraries: Library[];
  mode: ChatMode;
  quickRewrite?: string;
  onMakeSuggestion: (suggestedText: string) => void;
  onClose: () => void;
}

export function ChatPanel({
  selectedText,
  currentSelectedText = "",
  fullDocument,
  sectionText,
  libraries,
  mode,
  quickRewrite,
  onMakeSuggestion,
  onClose,
}: ChatPanelProps) {
  const [phase, setPhase] = useState<Phase>("empty");
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [approaches, setApproaches] = useState<TransitionApproach[]>([]);
  const [additionalContext, setAdditionalContext] = useState("");
  const [rewrite, setRewrite] = useState("");
  const [error, setError] = useState("");
  const [contextScope, setContextScope] = useState<ContextScope>("section");
  const [chatMessage, setChatMessage] = useState("");
  const [chatResponse, setChatResponse] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const diagnosedRef = useRef<string>("");

  const contextText = contextScope === "document"
    ? fullDocument
    : contextScope === "section"
      ? sectionText
      : selectedText;

  const libPayload = libraries.map((l) => ({
    name: l.name,
    styleRules: l.styleRules,
    referenceSamples: l.referenceSamples,
    vocabulary: l.vocabulary,
    structureNotes: l.structureNotes,
    generatedOverview: l.generatedOverview,
    exampleFiles: l.exampleFiles?.map((f: { name: string; content: string }) => ({ name: f.name, content: f.content })) || [],
    feedback: l.feedback?.map((f: { aiSuggested: string; userEdited: string }) => ({ aiSuggested: f.aiSuggested, userEdited: f.userEdited })) || [],
  }));

  // Handle quick mode (⌘J) — skip diagnosis, show rewrite directly
  useEffect(() => {
    if (mode !== "quick") return;
    diagnosedRef.current = ""; // reset so switching back to improve/transition works
    setImprovements([]);
    setApproaches([]);
    setAdditionalContext("");
    setError("");
    if (quickRewrite) {
      setRewrite(quickRewrite);
      setPhase("done");
    } else {
      setRewrite("");
      setPhase("rewriting");
    }
  }, [mode, quickRewrite]);

  // Handle chat mode — show input immediately, no auto API call
  useEffect(() => {
    if (mode !== "chat") return;
    diagnosedRef.current = "";
    setImprovements([]);
    setApproaches([]);
    setAdditionalContext("");
    setRewrite("");
    setChatResponse("");
    setChatMessage("");
    setError("");
    setPhase("chatting");
    // Focus the chat input after render
    setTimeout(() => chatInputRef.current?.focus(), 50);
  }, [mode, selectedText]);

  // Auto-resize chat textarea
  useEffect(() => {
    const el = chatInputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }, [chatMessage]);

  const sendChatMessage = useCallback(async () => {
    if (!chatMessage.trim()) return;
    setPhase("chat-responding");
    setError("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          selectedText,
          fullDocument: contextText,
          libraries: libPayload,
          message: chatMessage.trim(),
        }),
      });

      if (!res.ok) throw new Error("Failed");
      const { response } = await res.json();
      setChatResponse(response);
      setPhase("done");
    } catch {
      setError("Couldn't get a response. Try again.");
      setPhase("chatting");
    }
  }, [chatMessage, selectedText, contextText, libPayload]);

  // Auto-diagnose when selection changes (improve/transition modes only)
  useEffect(() => {
    if (mode === "quick" || mode === "chat") return;
    const cacheKey = `${selectedText}::${contextScope}`;
    if (!selectedText || cacheKey === diagnosedRef.current) return;
    diagnosedRef.current = cacheKey;
    setImprovements([]);
    setApproaches([]);
    setAdditionalContext("");
    setRewrite("");
    setError("");
    setPhase("diagnosing");

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "diagnose",
        chatMode: mode,
        selectedText,
        fullDocument: contextText,
        libraries: libPayload,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then(({ improvements: items }) => {
        if (mode === "transition") {
          setApproaches(
            items.map((item: { title: string; description: string; examples?: string[] }) => ({
              title: item.title,
              description: item.description,
              examples: item.examples || [],
              checked: false,
            }))
          );
        } else {
          setImprovements(
            items.map((item: { title: string; description: string; category?: string }) => ({
              title: item.title,
              description: item.description,
              category: (["general", "cleanup", "structural"].includes(item.category || "") ? item.category : "general") as Category,
              checked: false,
            }))
          );
        }
        setPhase("selecting");
      })
      .catch(() => {
        setError("Couldn't analyze the text. Try again.");
        setPhase("selecting");
      });
  }, [selectedText, mode, contextScope]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 100) + "px";
    }
  }, [additionalContext]);

  const toggleImprovement = useCallback((index: number) => {
    setImprovements((prev) =>
      prev.map((item, i) => (i === index ? { ...item, checked: !item.checked } : item))
    );
  }, []);

  const toggleApproach = useCallback((index: number) => {
    setApproaches((prev) =>
      prev.map((item, i) => (i === index ? { ...item, checked: !item.checked } : item))
    );
  }, []);

  const checkedImprovements = improvements.filter((i) => i.checked);
  const checkedApproaches = approaches.filter((a) => a.checked);
  const checkedCount = mode === "transition" ? checkedApproaches.length : checkedImprovements.length;

  const requestRewrite = useCallback(async () => {
    if (checkedCount === 0) return;
    setPhase("rewriting");
    setError("");

    try {
      const body =
        mode === "transition"
          ? {
              mode: "transition-rewrite",
              selectedText,
              fullDocument: contextText,
              libraries: libPayload,
              approaches: checkedApproaches.map((a) => ({
                title: a.title,
                description: a.description,
                examples: a.examples,
              })),
              comment: additionalContext,
            }
          : {
              mode: "rewrite",
              selectedText,
              fullDocument: contextText,
              libraries: libPayload,
              improvements: checkedImprovements.map((i) => `${i.title}: ${i.description}`),
              additionalContext,
            };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed");
      const { rewrite: text } = await res.json();
      setRewrite(text);
      setPhase("done");
    } catch {
      setError("Couldn't generate rewrite. Try again.");
      setPhase("selecting");
    }
  }, [checkedCount, mode, checkedApproaches, checkedImprovements, selectedText, contextText, libPayload, additionalContext]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      requestRewrite();
    }
  };

  const handleApplySuggestion = useCallback(() => {
    if (!rewrite) return;
    onMakeSuggestion(rewrite);
  }, [rewrite, onMakeSuggestion]);

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Context scope toggle */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/30">
        <span className="text-[10px] text-muted-foreground/60 mr-1">Context:</span>
        {(["document", "section", "selection"] as const).map((scope) => (
          <button
            key={scope}
            onClick={() => setContextScope(scope)}
            className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
              contextScope === scope
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {scope === "document" ? "Full doc" : scope === "section" ? "Section" : "Selection"}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {phase === "empty" && !selectedText && (
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Select text and press{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-sidebar-hover border border-border/50 text-[10px] font-mono">⌘K</kbd>{" "}
            to start improving
          </p>
        </div>
      )}

      {/* Active content */}
      {selectedText && (
        <>
          {/* Selected text preview — reflects the *live* editor selection so it
              never shows a stale snapshot from an earlier ⌘K. */}
          {currentSelectedText.trim() && (
            <div className="px-3 py-2 border-b border-border/30">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Selected text
              </p>
              <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3">
                {currentSelectedText}
              </p>
            </div>
          )}

          {/* Main content area */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Diagnosing state */}
            {phase === "diagnosing" && (
              <div className="flex items-center justify-center py-8">
                <span className="text-xs text-muted-foreground animate-pulse">
                  {mode === "transition" ? "Finding transitions..." : "Analyzing passage..."}
                </span>
              </div>
            )}

            {/* === IMPROVE MODE: categorized checklist === */}
            {mode === "improve" && (phase === "selecting" || phase === "rewriting" || phase === "done") && (
              <div className="px-3 py-3">
                {(["general", "cleanup", "structural"] as Category[]).map((cat) => {
                  const items = improvements
                    .map((item, i) => ({ ...item, index: i }))
                    .filter((item) => item.category === cat);
                  if (items.length === 0) return null;
                  const config = IMPROVE_CATEGORIES[cat];
                  return (
                    <div key={cat} className="mb-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                        <p className={`text-[10px] font-semibold uppercase tracking-wider ${config.color}`}>
                          {config.label}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        {items.map((item) => (
                          <button
                            key={item.index}
                            onClick={() => phase === "selecting" && toggleImprovement(item.index)}
                            disabled={phase !== "selecting"}
                            className={`w-full text-left flex gap-2.5 px-2.5 py-2 rounded-lg transition-colors ${
                              item.checked ? "bg-accent/10 border border-accent/20" : "bg-sidebar-hover/50 border border-transparent hover:bg-sidebar-hover"
                            } ${phase !== "selecting" ? "cursor-default" : "cursor-pointer"}`}
                          >
                            <div className={`w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${item.checked ? "bg-accent border-accent" : "border-border"}`}>
                              {item.checked && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground">{item.title}</p>
                              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{item.description}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* === TRANSITION MODE: approaches with examples === */}
            {mode === "transition" && (phase === "selecting" || phase === "rewriting" || phase === "done") && (
              <div className="px-3 py-3 space-y-3">
                {approaches.map((approach, i) => (
                  <button
                    key={i}
                    onClick={() => phase === "selecting" && toggleApproach(i)}
                    disabled={phase !== "selecting"}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                      approach.checked
                        ? "bg-purple-500/10 border border-purple-500/25"
                        : "bg-sidebar-hover/50 border border-transparent hover:bg-sidebar-hover"
                    } ${phase !== "selecting" ? "cursor-default" : "cursor-pointer"}`}
                  >
                    <div className="flex gap-2.5">
                      <div className={`w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${approach.checked ? "bg-purple-500 border-purple-500" : "border-border"}`}>
                        {approach.checked && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground">{approach.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{approach.description}</p>
                        {approach.examples.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {approach.examples.map((ex, j) => (
                              <p key={j} className="text-xs text-foreground/70 italic leading-relaxed pl-2 border-l-2 border-purple-500/30">
                                &ldquo;{ex}&rdquo;
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* === CHAT MODE: user message + response === */}
            {mode === "chat" && (phase === "chatting" || phase === "chat-responding" || phase === "done") && (
              <div className="px-3 py-3 space-y-3">
                {/* Chat input */}
                <div>
                  <textarea
                    ref={chatInputRef}
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChatMessage();
                      }
                    }}
                    placeholder="What would you like to know? e.g., &quot;Give me 3 alternative approaches...&quot;"
                    rows={3}
                    disabled={phase !== "chatting"}
                    className="w-full bg-sidebar-hover rounded-lg px-3 py-2.5 text-sm outline-none resize-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-accent/30 disabled:opacity-60"
                  />
                </div>

                {/* Chat response */}
                {phase === "done" && chatResponse && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Response</p>
                    <div className="bg-sidebar-hover/50 rounded-lg px-3 py-2.5 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                      {chatResponse}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rewrite result (non-chat modes) */}
            {phase === "done" && rewrite && mode !== "chat" && (
              <div className="px-3 pb-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {mode === "transition" ? "Suggested transition" : mode === "quick" ? "Suggestion" : "Rewrite"}
                </p>
                <div className="bg-sidebar-hover/50 rounded-lg px-3 py-2.5 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                  {rewrite}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="px-3 py-2">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div className="border-t border-border/30 p-3 space-y-2">
            {(phase === "rewriting" || phase === "chat-responding") && (
              <div className="flex items-center justify-center py-1">
                <span className="text-xs text-muted-foreground animate-pulse">
                  {phase === "chat-responding" ? "Thinking..." : mode === "transition" ? "Writing transition..." : "Rewriting..."}
                </span>
              </div>
            )}

            {phase === "chatting" && (
              <button
                onClick={sendChatMessage}
                disabled={!chatMessage.trim()}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Send
              </button>
            )}

            {phase === "selecting" && (
              <>
                <textarea
                  ref={inputRef}
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={mode === "transition" ? "e.g. \"These but a little smoother\"..." : "Add context (optional), then press Enter..."}
                  rows={1}
                  className="w-full bg-sidebar-hover rounded-lg px-3 py-2 text-sm outline-none resize-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-accent/30"
                />
                <button
                  onClick={requestRewrite}
                  disabled={checkedCount === 0}
                  className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    mode === "transition"
                      ? "bg-purple-500 text-white hover:bg-purple-600"
                      : "bg-accent text-accent-foreground hover:bg-accent/90"
                  }`}
                >
                  {mode === "transition"
                    ? `Write Transition (${checkedCount} selected)`
                    : `Rewrite (${checkedCount} selected)`}
                </button>
              </>
            )}

            {phase === "done" && mode !== "chat" && (
              <div className="space-y-2">
                <button
                  onClick={handleApplySuggestion}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white/90 text-neutral-800 hover:bg-white dark:bg-white/10 dark:text-foreground dark:hover:bg-white/15 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v4" />
                    <path d="m6.34 6.34 2.83 2.83" />
                    <path d="M2 12h4" />
                    <path d="M12 18v4" />
                    <path d="M18 12h4" />
                    <path d="m17.66 6.34-2.83 2.83" />
                  </svg>
                  Make Suggestion
                </button>
                <button
                  onClick={() => {
                    setRewrite("");
                    setPhase("selecting");
                  }}
                  className="w-full flex items-center justify-center px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Try again
                </button>
              </div>
            )}

            {phase === "done" && mode === "chat" && (
              <button
                onClick={() => {
                  setChatMessage("");
                  setChatResponse("");
                  setPhase("chatting");
                  setTimeout(() => chatInputRef.current?.focus(), 50);
                }}
                className="w-full flex items-center justify-center px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Ask another question
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
