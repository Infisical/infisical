import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  faArrowDownWideShort,
  faArrowUpWideShort,
  faCopy,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format, formatDistanceToNow } from "date-fns";

import { Button, Input, Spinner } from "@app/components/v2";
import { CopyButton } from "@app/components/v2/CopyButton";
import { useGetFolderCommitHistory } from "@app/hooks/api/folderCommits";

interface CommitActorMetadata {
  email?: string;
  name?: string;
}

interface Commit {
  id: string;
  message: string;
  createdAt: string;
  actorType: string;
  actorMetadata?: CommitActorMetadata;
}

const formatTimeAgo = (timestamp: string): string => {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
};

/**
 * Commit Item component for displaying a single commit
 */
const CommitItem = ({
  commit,
  onSelectCommit
}: {
  commit: Commit;
  onSelectCommit: (commitId: string, tab: string) => void;
}) => {
  return (
    <div className="border-b border-zinc-800 last:border-b-0">
      <div className="px-4 py-4 transition-colors duration-200 hover:bg-zinc-800">
        <div className="flex flex-col sm:flex-row sm:justify-between">
          <div className="w-5/6 flex-1">
            <div className="flex items-center">
              <Button
                variant="link"
                className="truncate text-left text-white hover:underline"
                isFullWidth
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectCommit(commit.id, "tab-commit-details");
                }}
              >
                {commit.message}
              </Button>
            </div>
            <p className="text-white-400 mt-2 flex flex-wrap items-center gap-4 text-sm">
              <span className="flex items-center text-mineshaft-300">
                {commit.actorMetadata?.email || commit.actorMetadata?.name || commit.actorType}
                <p className="ml-1 mr-1">committed</p>
                <time dateTime={commit.createdAt}>{formatTimeAgo(commit.createdAt)}</time>
              </span>
            </p>
          </div>
          <div className="mt-2 flex w-1/6 items-center justify-end sm:mt-0">
            <div className="flex items-center space-x-1">
              <Button
                variant="link"
                className="text-white hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectCommit(commit.id, "tab-commit-details");
                }}
              >
                <code className="text-white-400 px-3 py-1 font-mono text-sm">
                  {commit.id?.substring(0, 11)}
                </code>
              </Button>
              <CopyButton
                value={commit.id}
                name={commit.id}
                size="sm"
                variant="plain"
                color="text-mineshaft-400"
                icon={faCopy}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Date Group component for displaying commits grouped by date
 */
const DateGroup = ({
  date,
  commits,
  onSelectCommit
}: {
  date: string;
  commits: Commit[];
  onSelectCommit: (commitId: string, tab: string) => void;
}) => {
  return (
    <div className="mb-8 last:mb-0 last:pb-2">
      <div className="mb-4 flex items-center">
        <div className="relative mr-3 flex h-6 w-6 items-center justify-center">
          <div className="z-10 h-3 w-3 rounded-full border-2 border-mineshaft-600 bg-bunker-800" />
          <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-mineshaft-600" />
        </div>
        <h2 className="text-sm text-white">Commits on {date}</h2>
      </div>

      <div className="relative">
        <div className="absolute bottom-0 left-3 top-0 w-0.5 bg-mineshaft-600" />
        <div className="ml-10">
          {commits.map((commit) => (
            <div key={commit.id} className="relative mb-3 pb-1">
              <div className="overflow-hidden rounded-md border border-solid border-mineshaft-600">
                <CommitItem commit={commit} onSelectCommit={onSelectCommit} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const CommitHistoryTab = ({
  onSelectCommit,
  projectId,
  environment,
  secretPath
}: {
  onSelectCommit: (commitId: string, tab: string) => void;
  projectId: string;
  environment: string;
  secretPath: string;
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [offset, setOffset] = useState(0);
  const [allCommits, setAllCommits] = useState<Commit[]>([]);
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const limit = 5;

  // Debounce search term
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  const {
    data: response,
    isLoading,
    isFetching
  } = useGetFolderCommitHistory({
    workspaceId: projectId,
    environment,
    directory: secretPath,
    offset,
    limit,
    search: debouncedSearchTerm,
    sort: sortDirection
  });

  const commits = response?.commits || [];
  const hasMore = response?.hasMore || false;

  // Reset accumulated commits when search or sort changes
  useEffect(() => {
    setAllCommits([]);
    setOffset(0);
  }, [debouncedSearchTerm, sortDirection]);

  // Accumulate commits instead of replacing them
  useEffect(() => {
    if (commits.length > 0) {
      if (offset === 0) {
        // First load or after search/sort change - replace all commits
        setAllCommits(commits);
      } else {
        // Subsequent loads - append new commits
        setAllCommits((prev) => [...prev, ...commits]);
      }
    }
  }, [commits, offset]);

  const groupedCommits = useMemo(() => {
    return allCommits.reduce(
      (acc, commit) => {
        const date = format(new Date(commit.createdAt), "MMM d, yyyy");
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(commit);
        return acc;
      },
      {} as Record<string, Commit[]>
    );
  }, [allCommits]);

  const handleSort = useCallback(() => {
    setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const loadMoreCommits = useCallback(() => {
    if (hasMore && !isFetching) {
      setOffset((prev) => prev + limit);
    }
  }, [hasMore, isFetching, limit]);

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-col sm:flex-row sm:justify-end">
        <div className="flex w-full flex-wrap items-center gap-2">
          <div className="relative flex-grow">
            <Input
              placeholder="Search commits..."
              className="h-10 w-full rounded-md border-transparent bg-zinc-800 pl-9 pr-3 text-sm text-white placeholder-gray-400 focus:border-gray-600 focus:ring-primary-500/20"
              onChange={(e) => handleSearch(e.target.value)}
              value={searchTerm}
              aria-label="Search commits"
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 transform text-gray-400">
              <FontAwesomeIcon icon={faSearch} aria-hidden="true" />
            </div>
          </div>
          <Button
            variant="outline_bg"
            size="md"
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-800 px-4 py-2 text-sm text-white transition-colors duration-200 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            onClick={handleSort}
            aria-label={`Sort by date ${sortDirection === "desc" ? "ascending" : "descending"}`}
          >
            <FontAwesomeIcon
              icon={sortDirection === "desc" ? faArrowDownWideShort : faArrowUpWideShort}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>

      {isLoading && offset === 0 ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" aria-label="Loading commits" />
        </div>
      ) : (
        <div className="space-y-8">
          {Object.keys(groupedCommits).length > 0 ? (
            <>
              {Object.entries(groupedCommits).map(([date, dateCommits]) => (
                <DateGroup
                  key={date}
                  date={date}
                  commits={dateCommits}
                  onSelectCommit={onSelectCommit}
                />
              ))}
            </>
          ) : (
            <div className="text-white-400 flex min-h-40 flex-col items-center justify-center rounded-lg bg-zinc-900 py-8 text-center">
              <FontAwesomeIcon
                icon={faSearch}
                className="text-white-500 mb-3 text-3xl"
                aria-hidden="true"
              />
              <p>No matching commits found. Try a different search term.</p>
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center pb-2">
              <Button
                variant="outline_bg"
                size="md"
                className="rounded-md bg-zinc-900 px-6 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                onClick={loadMoreCommits}
                disabled={isFetching}
                aria-label="Load more commits"
              >
                {isFetching ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Loading...
                  </>
                ) : (
                  "Load more commits"
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
