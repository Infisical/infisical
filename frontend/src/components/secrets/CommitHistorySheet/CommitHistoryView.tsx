import { useState } from "react";
import { format } from "date-fns";
import {
  ArrowDownWideNarrowIcon,
  ArrowUpWideNarrowIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GitCommitHorizontalIcon,
  InfoIcon,
  SearchIcon,
  TriangleAlertIcon
} from "lucide-react";

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  ScrollableContent,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import {
  Commit,
  CommitAuthor,
  CommitAuthorFilter,
  useGetCommitAuthors,
  useGetFolderCommitHistory
} from "@app/hooks/api/folderCommits";

import { CommitChangeSummaryText, formatCommitResourceSummary } from "./CommitChangeSummary";
import { CommitHistorySkeleton } from "./CommitSkeletons";

const COMMITS_PER_PAGE = 10;

const getAuthorName = (commit: Pick<Commit, "actorMetadata" | "actorType">) =>
  commit.actorMetadata?.email ||
  commit.actorMetadata?.name ||
  (commit.actorType === ActorType.PLATFORM ? "Platform" : commit.actorType);

const getAuthorFilterLabel = (author: CommitAuthor) =>
  author.name || (author.actorType === ActorType.PLATFORM ? "Platform" : author.actorType);

const toAuthorFilter = (author: CommitAuthor): CommitAuthorFilter =>
  author.actorId ? { actorId: author.actorId } : { actorType: author.actorType };

const isSameAuthorFilter = (a?: CommitAuthorFilter, b?: CommitAuthorFilter) =>
  a?.actorId === b?.actorId && a?.actorType === b?.actorType;

const CommitRow = ({ commit, onSelect }: { commit: Commit; onSelect: () => void }) => {
  const resourceSummary = formatCommitResourceSummary(commit.summary);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-md border border-border bg-container px-4 py-3 text-left transition-colors duration-200 hover:bg-container-hover"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm text-foreground">
          {commit.message || <span className="text-muted italic">No message</span>}
        </p>
        <div className="flex min-w-0 items-center gap-2 text-xs text-accent">
          <span className="min-w-0 truncate">{getAuthorName(commit)}</span>
          {commit.actorType === ActorType.PLATFORM && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="-ml-1 flex shrink-0 items-center">
                  <InfoIcon className="size-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Generated automatically by the platform as part of an automated event.
              </TooltipContent>
            </Tooltip>
          )}
          <span aria-hidden className="shrink-0 text-muted">
            &middot;
          </span>
          <time className="shrink-0" dateTime={commit.createdAt}>
            {format(new Date(commit.createdAt), "h:mm a")}
          </time>
          {resourceSummary && (
            <>
              <span aria-hidden className="shrink-0 text-muted">
                &middot;
              </span>
              <span className="shrink-0">{resourceSummary}</span>
            </>
          )}
        </div>
      </div>
      <CommitChangeSummaryText summary={commit.summary} />
      <code className="shrink-0 font-mono text-xs text-accent">{commit.id.substring(0, 8)}</code>
      <ChevronRightIcon className="size-4 shrink-0 text-muted transition-colors duration-200 group-hover:text-foreground" />
    </button>
  );
};

type Props = {
  projectId: string;
  environment: string;
  environmentName: string;
  secretPath: string;
  onSelectCommit: (commitId: string, folderId: string) => void;
};

export const CommitHistoryView = ({
  projectId,
  environment,
  environmentName,
  secretPath,
  onSelectCommit
}: Props) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 400);
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [author, setAuthor] = useState<CommitAuthorFilter | undefined>();

  const { data: authors } = useGetCommitAuthors({ projectId, environment, directory: secretPath });

  const { data, isPending, isError, refetch, fetchNextPage, isFetchingNextPage, hasNextPage } =
    useGetFolderCommitHistory({
      projectId,
      environment,
      directory: secretPath,
      limit: COMMITS_PER_PAGE,
      search: debouncedSearch,
      sort,
      author
    });

  const selectedAuthor = authors?.find((candidate) =>
    isSameAuthorFilter(toAuthorFilter(candidate), author)
  );
  const remainingCount = (data?.total ?? 0) - (data?.loadedCount ?? 0);
  const isFiltered = Boolean(debouncedSearch || author);
  const hasCommits = Boolean(data?.groups.length);

  return (
    <>
      <SheetHeader className="gap-2">
        <SheetTitle className="flex items-center gap-2">
          <GitCommitHorizontalIcon className="size-4 text-project" />
          Commit History
        </SheetTitle>
        <div className="flex items-center gap-2 text-xs text-accent">
          <Badge variant="neutral">{environmentName}</Badge>
          <code className="font-mono">{secretPath}</code>
          {data?.total !== undefined && (
            <>
              <span aria-hidden className="text-muted">
                &middot;
              </span>
              <span>
                {data.total} {data.total === 1 ? "commit" : "commits"}
              </span>
            </>
          )}
        </div>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="min-w-64 flex-1">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search commits, keys, or folders..."
              aria-label="Search commits"
            />
          </InputGroup>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="max-w-56">
                <span className="min-w-0 truncate">
                  Author: {selectedAuthor ? getAuthorFilterLabel(selectedAuthor) : "Anyone"}
                </span>
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-72">
              <DropdownMenuItem onClick={() => setAuthor(undefined)}>Anyone</DropdownMenuItem>
              {authors?.map((candidate) => (
                <DropdownMenuItem
                  key={`${candidate.actorType}-${candidate.actorId ?? "none"}`}
                  onClick={() => setAuthor(toAuthorFilter(candidate))}
                >
                  <span className="min-w-0 truncate">{getAuthorFilterLabel(candidate)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {sort === "desc" ? "Newest first" : "Oldest first"}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSort("desc")}>
                <ArrowDownWideNarrowIcon />
                Newest First
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSort("asc")}>
                <ArrowUpWideNarrowIcon />
                Oldest First
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ScrollableContent
          aria-label="Commit history"
          edgeBehavior="fade"
          outline={false}
          maxHeight="100%"
          containerClassName="flex min-h-0 flex-1 flex-col"
          className="flex-1"
        >
          {isPending && <CommitHistorySkeleton />}

          {!isPending && !hasCommits && isError && (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <TriangleAlertIcon />
                </EmptyMedia>
                <EmptyTitle>Unable To Load Commit History</EmptyTitle>
                <EmptyDescription>
                  Something went wrong loading the commits for this path.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Try Again
                </Button>
              </EmptyContent>
            </Empty>
          )}

          {!isPending && !hasCommits && !isError && (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <GitCommitHorizontalIcon />
                </EmptyMedia>
                <EmptyTitle>No Commits Found</EmptyTitle>
                <EmptyDescription>
                  {isFiltered
                    ? "No commits match your search and filters."
                    : "Changes to secrets and folders in this path will show up here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {!isPending && hasCommits && (
            <div>
              {data?.groups.map((group) => (
                <div key={group.date} className="mb-6 last:mb-0">
                  <div className="mb-2 flex items-center gap-2">
                    <GitCommitHorizontalIcon className="size-4 text-muted" />
                    <h3 className="text-sm font-medium text-foreground">{group.date}</h3>
                    <span aria-hidden className="text-xs text-muted">
                      &middot;
                    </span>
                    <span className="text-xs text-accent">
                      {group.commits.length} {group.commits.length === 1 ? "commit" : "commits"}
                    </span>
                  </div>
                  <div className="relative flex flex-col gap-2 pl-6">
                    {/* One rail segment per day, so the line breaks between date groups */}
                    <span aria-hidden className="absolute top-0 bottom-0 left-2 w-px bg-border" />
                    {group.commits.map((commit) => (
                      <CommitRow
                        key={commit.id}
                        commit={commit}
                        onSelect={() => onSelectCommit(commit.id, commit.folderId)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {hasNextPage && (
            <div className="flex justify-center py-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                isDisabled={isFetchingNextPage}
                isPending={isFetchingNextPage}
              >
                Load {remainingCount > 0 ? remainingCount : ""}{" "}
                {sort === "desc" ? "older" : "newer"} commits
              </Button>
            </div>
          )}
        </ScrollableContent>
      </div>
    </>
  );
};
