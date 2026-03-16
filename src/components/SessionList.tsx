import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Search, Loader2, X, ChevronDown, ExternalLink, Copy, Check, GitFork, LayoutGrid, ArrowDownUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { ClaudeMemoriesDropdown } from "@/components/ClaudeMemoriesDropdown";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HighlightedText } from "@/components/HighlightedText";
import { cn } from "@/lib/utils";
import { truncateText, getFirstLine } from "@/lib/date-utils";
import { useDebounce } from "@/hooks/useDebounce";
import { api } from "@/lib/api";
import type { Session, SessionSearchResult, ClaudeMdFile } from "@/lib/api";
import { buildForkTree, flattenTree, countForks } from "@/lib/forkGraph";

interface SessionListProps {
  sessions: Session[];
  projectId: string;
  projectPath: string;
  onBack?: () => void;
  onSessionClick?: (session: Session) => void;
  onEditClaudeFile?: (file: ClaudeMdFile) => void;
  className?: string;
}

const ITEMS_PER_PAGE = 12;

function formatSessionDate(session: Session) {
  const date = session.message_timestamp
    ? new Date(session.message_timestamp)
    : new Date(session.created_at * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatModifiedDate(session: Session) {
  if (!session.modified_at) return null;
  const modDate = new Date(session.modified_at * 1000);
  return modDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  projectId,
  projectPath,
  onSessionClick,
  onEditClaudeFile,
  className,
}) => {
  const [viewMode, setViewMode] = useState<"grid" | "tree">("grid");
  const [sortBy, setSortBy] = useState<"created" | "modified">("created");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SessionSearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const debouncedQuery = useDebounce(searchQuery, 300);
  const normalizedQuery = debouncedQuery.trim();
  const searchRequestId = useRef(0);
  const skipNextSearch = useRef(false);

  // Hard reset when project context changes
  useEffect(() => {
    skipNextSearch.current = true;
    searchRequestId.current += 1;
    setSearchQuery("");
    setSearchResults(null);
    setSearchError(null);
    setSearching(false);
    setCurrentPage(1);
    setExpandedSessions(new Set());
  }, [projectId]);

  // Invalidate when query is cleared
  useEffect(() => {
    searchRequestId.current += 1;
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearchError(null);
      setSearching(false);
      setCurrentPage(1);
      setExpandedSessions(new Set());
    }
  }, [searchQuery]);

  // Perform search when debounced query changes
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (normalizedQuery.length < 2) {
      setSearchResults(null);
      setSearchError(null);
      setSearching(false);
      return;
    }

    const requestId = ++searchRequestId.current;
    setSearching(true);
    setSearchError(null);

    api.searchProjectSessions(projectId, normalizedQuery)
      .then((results) => {
        if (searchRequestId.current === requestId) {
          setSearchResults(results);
          setCurrentPage(1);
          setExpandedSessions(new Set());
        }
      })
      .catch((err) => {
        console.error("Search failed:", err);
        if (searchRequestId.current === requestId) {
          setSearchResults(null);
          setSearchError("Search failed. Please try again.");
        }
      })
      .finally(() => {
        if (searchRequestId.current === requestId) {
          setSearching(false);
        }
      });
  }, [debouncedQuery, projectId]);

  const isSearchActive =
    searchQuery.trim().length >= 2 &&
    (normalizedQuery.length >= 2 || searching || searchResults !== null);

  const sortedSessions = useMemo(() => {
    if (sortBy === "modified") {
      return [...sessions].sort((a, b) => (b.modified_at ?? b.created_at) - (a.modified_at ?? a.created_at));
    }
    return sessions;
  }, [sessions, sortBy]);

  const displayedSessions: (Session | SessionSearchResult)[] = isSearchActive ? (searchResults ?? []) : sortedSessions;

  // Calculate pagination
  const totalPages = Math.max(1, Math.ceil(displayedSessions.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentSessions = displayedSessions.slice(startIndex, endIndex);

  // Reset to page 1 if sessions dataset changes
  useEffect(() => {
    setCurrentPage(1);
  }, [sessions, projectId]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults(null);
    setSearchError(null);
    setCurrentPage(1);
    setExpandedSessions(new Set());
  }, []);

  const toggleExpanded = useCallback((sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  const copyResumeCommand = useCallback((sessionId: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(`claude --resume ${sessionId}`)
      .then(() => {
        setCopiedId(sessionId);
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch((err) => console.error("Failed to copy:", err));
  }, []);

  const handleSessionClick = useCallback((session: Session) => {
    if (onSessionClick) {
      onSessionClick(session);
      return;
    }
    window.dispatchEvent(new CustomEvent('claude-session-selected', {
      detail: { session, projectPath }
    }));
  }, [projectPath, onSessionClick]);

  // Build fork tree for tree view (only when not searching)
  const forkTreeNodes = useMemo(() => {
    if (isSearchActive) return [];
    return flattenTree(buildForkTree(sortedSessions));
  }, [sortedSessions, isSearchActive]);

  // Paginate tree view
  const totalTreePages = Math.max(1, Math.ceil(forkTreeNodes.length / ITEMS_PER_PAGE));
  const currentTreeNodes = forkTreeNodes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <TooltipProvider>
      <div className={cn("space-y-4", className)}>
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search sessions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search sessions"
          className="pl-9 pr-9 h-9"
        />
        {searchQuery && (
          <button
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* View mode toggle + sort + search status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded transition-colors",
                viewMode === "grid" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              title="Grid view"
              aria-label="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("tree")}
              className={cn(
                "p-1.5 rounded transition-colors",
                viewMode === "tree" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              title="Tree view"
              aria-label="Tree view"
            >
              <GitFork className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={() => setSortBy(prev => prev === "created" ? "modified" : "created")}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-caption text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={`Sort by ${sortBy === "created" ? "last edited" : "created date"}`}
          >
            <ArrowDownUp className="h-3 w-3" />
            {sortBy === "created" ? "Created" : "Edited"}
          </button>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {searching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching sessions...
          </div>
        )}
        {searchError && !searching && (
          <p className="text-sm text-destructive">{searchError}</p>
        )}
        {searchResults !== null && !searching && !searchError && (
          <p className="text-sm text-muted-foreground">
            {searchResults.length === 0
              ? "No sessions found"
              : `Showing ${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
          </p>
        )}
      </div>

      {/* CLAUDE.md Memories Dropdown */}
      {onEditClaudeFile && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <ClaudeMemoriesDropdown
            projectPath={projectPath}
            onEditFile={onEditClaudeFile}
          />
        </motion.div>
      )}

      <AnimatePresence mode="popLayout">
        {isSearchActive ? (
          /* Search results: single-column accordion */
          <div className="flex flex-col gap-3">
            {currentSessions.map((item, index) => {
              const result = item as SessionSearchResult;
              const session = result;
              const snippets = result.snippets || [];
              const isExpanded = expandedSessions.has(session.id);

              return (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{
                    duration: 0.3,
                    delay: index * 0.05,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                >
                  <Card className={cn(
                    "transition-all duration-200",
                    session.todo_data && "bg-primary/5"
                  )}>
                    {/* Accordion header */}
                    <div className="flex items-center gap-3 p-3 hover:bg-accent/50 rounded-t-lg">
                      <button
                        type="button"
                        className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                        onClick={() => toggleExpanded(session.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`session-snippets-${session.id}`}
                      >
                        <ChevronDown className={cn(
                          "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
                          isExpanded && "rotate-180"
                        )} />
                        <Clock className="h-4 w-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-body-small font-medium">
                              Session on {formatSessionDate(session)}
                              {(() => {
                                const mod = formatModifiedDate(session);
                                return mod ? <span className="text-caption text-muted-foreground font-normal ml-1">(edited {mod})</span> : null;
                              })()}
                            </p>
                            {session.todo_data && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-caption font-medium bg-primary/10 text-primary">
                                Todo
                              </span>
                            )}
                            {session.forked_from && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-caption font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400">
                                <GitFork className="h-2.5 w-2.5" />
                                Fork
                              </span>
                            )}
                            <span className="text-caption text-muted-foreground font-mono ml-auto">
                              {session.id.slice(-8)}
                            </span>
                          </div>
                          <div className="mt-0.5 space-y-0.5">
                            {session.first_message ? (
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {session.last_message && session.last_message !== session.first_message && (
                                  <span className="text-muted-foreground/50 mr-1">first:</span>
                                )}
                                {truncateText(getFirstLine(session.first_message), 100)}
                              </p>
                            ) : null}
                            {session.last_message && session.last_message !== session.first_message && (
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                <span className="text-muted-foreground/50 mr-1">last:</span>
                                {truncateText(getFirstLine(session.last_message), 100)}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-caption text-muted-foreground shrink-0">
                          {snippets.length} match{snippets.length !== 1 ? 'es' : ''}
                        </span>
                      </button>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          title="Open session"
                          aria-label="Open session"
                          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => handleSessionClick(session)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Copy resume command"
                          aria-label="Copy resume command"
                          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => copyResumeCommand(session.id)}
                        >
                          {copiedId === session.id
                            ? <Check className="h-3.5 w-3.5 text-green-500" />
                            : <Copy className="h-3.5 w-3.5" />
                          }
                        </button>
                      </div>
                    </div>

                    {/* Accordion content: matching snippets */}
                    <AnimatePresence>
                      {isExpanded && snippets.length > 0 && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div id={`session-snippets-${session.id}`} className="border-t px-3 pb-3">
                            <div className="max-h-60 overflow-y-auto mt-2 space-y-2">
                              {snippets.map((snippet, i) => (
                                <div
                                  key={i}
                                  className="text-xs text-muted-foreground bg-muted/50 rounded p-2 leading-relaxed"
                                >
                                  <HighlightedText text={snippet} terms={result.highlight_terms ?? [normalizedQuery]} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : viewMode === "tree" ? (
          /* Tree view: indented single-column list */
          <div className="flex flex-col gap-2">
            {currentTreeNodes.map((node, index) => {
              const session = node.session;
              const depth = Math.min(node.depth, 5);
              const forks = countForks(session.id, sortedSessions);

              return (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{
                    duration: 0.2,
                    delay: index * 0.02,
                  }}
                  style={{ paddingLeft: `${depth * 24}px` }}
                >
                  <div className="flex items-center gap-1">
                    {depth > 0 && (
                      <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                        <div className="w-4 border-t border-muted-foreground/30" />
                        <GitFork className="h-3 w-3 text-orange-500/70" />
                      </div>
                    )}
                    <Card
                      className={cn(
                        "flex-1 p-3 hover:bg-accent/50 transition-all duration-200 cursor-pointer",
                        session.todo_data && "bg-primary/5"
                      )}
                      onClick={() => handleSessionClick(session)}
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-body-small font-medium">
                            Session on {formatSessionDate(session)}
                            {(() => {
                              const mod = formatModifiedDate(session);
                              return mod ? <span className="text-caption text-muted-foreground font-normal ml-1">(edited {mod})</span> : null;
                            })()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {session.todo_data && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-caption font-medium bg-primary/10 text-primary">
                              Todo
                            </span>
                          )}
                          {session.forked_from && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-caption font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400">
                              <GitFork className="h-2.5 w-2.5" />
                              Fork
                            </span>
                          )}
                          {forks > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-caption font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              <GitFork className="h-2.5 w-2.5" />
                              {forks}
                            </span>
                          )}
                        </div>
                        <span className="text-caption text-muted-foreground font-mono shrink-0">
                          {session.id.slice(-8)}
                        </span>
                      </div>
                      <div className="mt-1 ml-6 space-y-0.5">
                        {session.first_message ? (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {session.last_message && session.last_message !== session.first_message && (
                              <span className="text-muted-foreground/50 mr-1">first:</span>
                            )}
                            {truncateText(getFirstLine(session.first_message), 120)}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground/50 italic">
                            No messages yet
                          </p>
                        )}
                        {session.last_message && session.last_message !== session.first_message && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            <span className="text-muted-foreground/50 mr-1">last:</span>
                            {truncateText(getFirstLine(session.last_message), 120)}
                          </p>
                        )}
                      </div>
                    </Card>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          /* Default view: single-column list */
          <div className="flex flex-col gap-2">
            {currentSessions.map((session, index) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{
                  duration: 0.2,
                  delay: index * 0.02,
                }}
              >
                <Card
                  className={cn(
                    "p-3 hover:bg-accent/50 transition-all duration-200 cursor-pointer",
                    session.todo_data && "bg-primary/5"
                  )}
                  onClick={() => handleSessionClick(session)}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-body-small font-medium">
                        Session on {formatSessionDate(session)}
                        {(() => {
                          const mod = formatModifiedDate(session);
                          return mod ? <span className="text-caption text-muted-foreground font-normal ml-1">(edited {mod})</span> : null;
                        })()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {session.todo_data && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-caption font-medium bg-primary/10 text-primary">
                          Todo
                        </span>
                      )}
                      {session.forked_from && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-caption font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400">
                          <GitFork className="h-2.5 w-2.5" />
                          Fork
                        </span>
                      )}
                      {(() => {
                        const forks = countForks(session.id, sortedSessions);
                        return forks > 0 ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-caption font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            <GitFork className="h-2.5 w-2.5" />
                            {forks}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <span className="text-caption text-muted-foreground font-mono shrink-0">
                      {session.id.slice(-8)}
                    </span>
                  </div>
                  <div className="mt-1 ml-6 space-y-0.5">
                    {session.first_message ? (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {session.last_message && session.last_message !== session.first_message && (
                          <span className="text-muted-foreground/50 mr-1">first:</span>
                        )}
                        {truncateText(getFirstLine(session.first_message), 120)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground/50 italic">
                        No messages yet
                      </p>
                    )}
                    {session.last_message && session.last_message !== session.first_message && (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        <span className="text-muted-foreground/50 mr-1">last:</span>
                        {truncateText(getFirstLine(session.last_message), 120)}
                      </p>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

        <Pagination
          currentPage={currentPage}
          totalPages={!isSearchActive && viewMode === "tree" ? totalTreePages : totalPages}
          onPageChange={setCurrentPage}
        />
      </div>
    </TooltipProvider>
  );
};
