"use client";

import { useState, useRef, useEffect } from "react";
import { Library } from "@/lib/libraries";

interface LibrarySelectorProps {
  libraries: Library[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function LibrarySelector({
  libraries,
  selectedIds,
  onChange,
}: LibrarySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = libraries.filter((l) => selectedIds.includes(l.id));
  const available = libraries.filter((l) => !selectedIds.includes(l.id));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addLibrary = (id: string) => {
    onChange([...selectedIds, id]);
  };

  const removeLibrary = (id: string) => {
    onChange(selectedIds.filter((i) => i !== id));
  };

  return (
    <div className="flex items-center gap-2 flex-wrap" ref={dropdownRef}>
      {/* Selected library tags */}
      {selected.map((lib) => (
        <span
          key={lib.id}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20"
        >
          {lib.name}
          <button
            onClick={() => removeLibrary(lib.id)}
            className="hover:text-foreground transition-colors ml-0.5"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </span>
      ))}

      {/* Add button / dropdown */}
      {available.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted border border-dashed border-border transition-colors"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Style
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 mt-1 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[160px] z-50">
              {available.map((lib) => (
                <button
                  key={lib.id}
                  onClick={() => {
                    addLibrary(lib.id);
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                >
                  <span className="text-foreground">{lib.name}</span>
                  {lib.description && (
                    <span className="text-muted-foreground text-xs ml-2">
                      {lib.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
