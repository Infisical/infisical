import { useCallback, useEffect, useRef, useState } from "react";
import {
  faArrowDownWideShort,
  faArrowUpWideShort,
  faCodeCommit,
  faCopy,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatDistanceToNow } from "date-fns";

import { Button, ContentLoader, EmptyState, IconButton, Input } from "@app/components/v2";
import { CopyButton } from "@app/components/v2/CopyButton";
import { Commit, useGetFolderCommitHistory } from "@app/hooks/api/folderCommits";

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
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelectCommit(commit.id, "tab-commit-details");
      }}
      className="w-full border border-b-0 border-mineshaft-600 bg-mineshaft-800 first:rounded-t-md last:rounded-b-md last:border-b"
    >
      <div className="flex gap-2 px-4 py-3 transition-colors duration-200 hover:bg-zinc-800">
        <div className="flex min-w-0 flex-1 flex-col items-start">
          <p className="block w-full truncate text-left text-sm text-mineshaft-100">
            {commit.message || <span className="text-mineshaft-400 italic">No message</span>}
          </p>
          <p className="text-left text-xs text-mineshaft-300">
            {commit.actorMetadata?.email || commit.actorMetadata?.name || commit.actorType}{" "}
            committed <time dateTime={commit.createdAt}>{formatTimeAgo(commit.createdAt)}</time>
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <code className="mt-0.5 font-mono text-xs text-mineshaft-400">
            {commit.id?.substring(0, 11)}
          </code>
          <CopyButton
            value={commit.id}
            name={commit.id}
            size="xs"
            variant="plain"
            color="text-mineshaft-400"
            icon={faCopy}
          />
        </div>
      </div>
    </button>
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
    <div className="mt-4 first:mt-0">
      <div className="mb-4 ml-[0.15rem] flex items-center">
        <FontAwesomeIcon icon={faCodeCommit} className="text-mineshaft-400" />
        <h2 className="ml-4 text-sm text-mineshaft-400">Commits on {date}</h2>
      </div>
      <div className="relative">
        <div className="absolute top-0 bottom-0 left-3 w-[0.1rem] bg-mineshaft-500" />
        <div className="ml-10">
          {commits.map((commit) => (
            <CommitItem key={commit.id} commit={commit} onSelectCommit={onSelectCommit} />
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
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const limit = 10;

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
    data: groupedCommits,
    isLoading,
    fetchNextPage,
    isFetchingNextPage,
    hasNextPage
  } = useGetFolderCommitHistory({
    projectId,
    environment,
    directory: secretPath,
    limit,
    search: debouncedSearchTerm,
    sort: sortDirection
  });

  const handleSort = useCallback(() => {
    setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  return (
    <div className="mt-4 w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <p className="mb-4 text-xl font-medium text-mineshaft-100">Commit History</p>
      <div className="mb-4 flex flex-col sm:flex-row sm:justify-end">
        <div className="flex w-full flex-wrap items-center gap-2">
          <div className="relative grow">
            <Input
              leftIcon={<FontAwesomeIcon icon={faSearch} aria-hidden="true" />}
              placeholder="Search commits..."
              onChange={(e) => handleSearch(e.target.value)}
              value={searchTerm}
              aria-label="Search commits"
            />
          </div>
          <IconButton
            variant="outline_bg"
            size="sm"
            className="flex h-[2.4rem] items-center justify-center gap-2 rounded-md"
            onClick={handleSort}
            ariaLabel={`Sort by date ${sortDirection === "desc" ? "ascending" : "descending"}`}
          >
            <FontAwesomeIcon
              icon={sortDirection === "desc" ? faArrowDownWideShort : faArrowUpWideShort}
              aria-hidden="true"
            />
          </IconButton>
        </div>
      </div>
      {isLoading ? (
        <ContentLoader className="h-80" />
      ) : (
        <div>
          {groupedCommits && Object.keys(groupedCommits).length > 0 ? (
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
            <EmptyState title="No commits found." icon={faCodeCommit} />
          )}
          {hasNextPage && (
            <div className="flex justify-center pb-2">
              <Button
                variant="outline_bg"
                size="sm"
                className="mt-4 ml-10 w-full"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                isLoading={isFetchingNextPage}
                aria-label="Load more commits"
              >
                Load More Commits
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
