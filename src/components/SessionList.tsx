import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, MessageSquare, Search, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { ClaudeMemoriesDropdown } from "@/components/ClaudeMemoriesDropdown";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { truncateText, getFirstLine } from "@/lib/date-utils";
import { useDebounce } from "@/hooks/useDebounce";
import { api } from "@/lib/api";
import type { Session, ClaudeMdFile } from "@/lib/api";

interface SessionListProps {
  /**
   * Array of sessions to display
   */
  sessions: Session[];
  /**
   * The project ID (for search API calls)
   */
  projectId: string;
  /**
   * The current project path being viewed
   */
  projectPath: string;
  /**
   * Optional callback to go back to project list (deprecated - use tabs instead)
   */
  onBack?: () => void;
  /**
   * Callback when a session is clicked
   */
  onSessionClick?: (session: Session) => void;
  /**
   * Callback when a CLAUDE.md file should be edited
   */
  onEditClaudeFile?: (file: ClaudeMdFile) => void;
  /**
   * Optional className for styling
   */
  className?: string;
}

const ITEMS_PER_PAGE = 12;

/**
 * SessionList component - Displays paginated sessions for a specific project
 * 
 * @example
 * <SessionList
 *   sessions={sessions}
 *   projectPath="/Users/example/project"
 *   onBack={() => setSelectedProject(null)}
 *   onSessionClick={(session) => console.log('Selected session:', session)}
 * />
 */
export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  projectId,
  projectPath,
  onSessionClick,
  onEditClaudeFile,
  className,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Session[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const debouncedQuery = useDebounce(searchQuery, 300);
  const searchRequestId = useRef(0);

  // Hard reset when project context changes
  useEffect(() => {
    searchRequestId.current += 1;
    setSearchQuery("");
    setSearchResults(null);
    setSearchError(null);
    setSearching(false);
    setCurrentPage(1);
  }, [projectId]);

  // Invalidate when query is cleared
  useEffect(() => {
    searchRequestId.current += 1;
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearchError(null);
      setSearching(false);
      setCurrentPage(1);
    }
  }, [searchQuery]);

  // Perform search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSearchResults(null);
      setSearchError(null);
      setSearching(false);
      return;
    }

    const requestId = ++searchRequestId.current;
    setSearching(true);
    setSearchError(null);

    api.searchProjectSessions(projectId, debouncedQuery.trim())
      .then((results) => {
        if (searchRequestId.current === requestId) {
          setSearchResults(results);
          setCurrentPage(1);
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

  const displayedSessions = searchResults !== null ? searchResults : sessions;

  // Calculate pagination
  const totalPages = Math.ceil(displayedSessions.length / ITEMS_PER_PAGE);
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
  }, []);
  
  return (
    <TooltipProvider>
      <div className={cn("space-y-4", className)}>
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search all sessions..."
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

      {/* Search status */}
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
            : `${searchResults.length} of ${sessions.length} sessions`}
        </p>
      )}

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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {currentSessions.map((session, index) => (
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
              <Card
                className={cn(
                  "p-3 hover:bg-accent/50 transition-all duration-200 cursor-pointer group h-full",
                  session.todo_data && "bg-primary/5"
                )}
                onClick={() => {
                  // Emit a special event for Claude Code session navigation
                  const event = new CustomEvent('claude-session-selected', { 
                    detail: { session, projectPath } 
                  });
                  window.dispatchEvent(event);
                  onSessionClick?.(session);
                }}
              >
                <div className="flex flex-col h-full">
                  <div className="flex-1">
                    {/* Session header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-1.5 flex-1 min-w-0">
                        <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-body-small font-medium">
                            Session on {session.message_timestamp 
                              ? new Date(session.message_timestamp).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric',
                                  year: 'numeric'
                                })
                              : new Date(session.created_at * 1000).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric',
                                  year: 'numeric'
                                })
                            }
                          </p>
                        </div>
                      </div>
                      {session.todo_data && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-caption font-medium bg-primary/10 text-primary">
                          Todo
                        </span>
                      )}
                    </div>
                    
                    {/* First message preview */}
                    {session.first_message ? (
                      <p className="text-caption text-muted-foreground line-clamp-2 mb-2">
                        {truncateText(getFirstLine(session.first_message), 120)}
                      </p>
                    ) : (
                      <p className="text-caption text-muted-foreground/60 italic mb-2">
                        No messages yet
                      </p>
                    )}
                  </div>
                  
                  {/* Metadata footer */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <p className="text-caption text-muted-foreground font-mono">
                      {session.id.slice(-8)}
                    </p>
                    {session.todo_data && (
                      <MessageSquare className="h-3 w-3 text-primary" />
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </AnimatePresence>
      
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>
    </TooltipProvider>
  );
}; 