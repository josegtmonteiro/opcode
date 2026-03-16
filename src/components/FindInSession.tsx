import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FindMatch {
  messageIndex: number;
  // We track which match within the message this is
  matchIndexInMessage: number;
}

interface FindInSessionProps {
  visible: boolean;
  onClose: () => void;
  messages: any[];
  onNavigate: (messageIndex: number) => void;
  /** Current match index (0-based) */
  currentMatch: number;
  /** Total number of matches */
  totalMatches: number;
  /** Called when query or navigation changes */
  onQueryChange: (query: string) => void;
  onPrev: () => void;
  onNext: () => void;
}

export function FindInSession({
  visible,
  onClose,
  currentMatch,
  totalMatches,
  onQueryChange,
  onPrev,
  onNext,
}: FindInSessionProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      // Focus input when shown, with a small delay for animation
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      onQueryChange("");
    }
  }, [visible, onQueryChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onQueryChange(val);
  }, [onQueryChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter") {
      if (e.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
    }
  }, [onClose, onPrev, onNext]);

  if (!visible) return null;

  return (
    <div className="absolute top-2 right-6 z-50 flex items-center gap-1 bg-background border rounded-lg shadow-lg px-3 py-1.5">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Find in session..."
        className="bg-transparent text-sm text-foreground outline-none w-48 placeholder:text-muted-foreground"
      />
      <span className={cn(
        "text-xs tabular-nums min-w-[3rem] text-center",
        totalMatches > 0 ? "text-muted-foreground" : query.length > 0 ? "text-destructive" : "text-muted-foreground"
      )}>
        {query.length > 0 ? `${totalMatches > 0 ? currentMatch + 1 : 0}/${totalMatches}` : ""}
      </span>
      <div className="w-px h-4 bg-border mx-1" />
      <button
        onClick={onPrev}
        disabled={totalMatches === 0}
        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        title="Previous (Shift+Enter)"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        onClick={onNext}
        disabled={totalMatches === 0}
        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        title="Next (Enter)"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      <button
        onClick={onClose}
        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        title="Close (Esc)"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Extracts searchable text from a ClaudeStreamMessage.
 */
export function extractMessageText(message: any): string {
  const parts: string[] = [];

  if (message.message?.content) {
    const content = message.message.content;
    if (typeof content === "string") {
      parts.push(content);
    } else if (Array.isArray(content)) {
      for (const item of content) {
        if (item.type === "text" && item.text) {
          parts.push(item.text);
        } else if (item.type === "tool_use" && item.input) {
          // Include tool input text for searchability
          if (typeof item.input === "string") {
            parts.push(item.input);
          } else if (item.input.command) {
            parts.push(item.input.command);
          } else if (item.input.content) {
            parts.push(item.input.content);
          }
        } else if (item.type === "tool_result") {
          if (typeof item.content === "string") {
            parts.push(item.content);
          } else if (Array.isArray(item.content)) {
            for (const sub of item.content) {
              if (sub.type === "text" && sub.text) {
                parts.push(sub.text);
              }
            }
          }
        }
      }
    }
  }

  // Also check direct content field
  if (message.content && typeof message.content === "string") {
    parts.push(message.content);
  }

  return parts.join(" ");
}

/**
 * Builds an index of all matches across messages.
 * Returns an array of {messageIndex} for each match occurrence.
 */
export function buildMatchIndex(
  messages: any[],
  query: string
): FindMatch[] {
  if (!query || query.length < 1) return [];

  const matches: FindMatch[] = [];
  const queryLower = query.toLowerCase();

  for (let i = 0; i < messages.length; i++) {
    const text = extractMessageText(messages[i]).toLowerCase();
    let pos = 0;
    let matchInMsg = 0;
    while ((pos = text.indexOf(queryLower, pos)) !== -1) {
      matches.push({ messageIndex: i, matchIndexInMessage: matchInMsg });
      matchInMsg++;
      pos += queryLower.length;
    }
  }

  return matches;
}
