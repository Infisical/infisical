import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { VariableFormDialog } from "@app/components/agent-vault/VariableFormDialog";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  MAX_PERSONAL_VARIABLES,
  MAX_VARIABLES,
  toVariableReference
} from "@app/helpers/agentVaultVariables";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import {
  AgentVaultVariableScope,
  useListAgentVaultVariables,
  useRevealAgentVaultVariableValue
} from "@app/hooks/api/agentVault";
import { TAgentVaultVariable } from "@app/hooks/api/agentVault/types";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";
import { DeleteVariableDialog } from "./DeleteVariableDialog";
import { UsedByBundleBadges } from "./UsedByBundleBadges";

enum SortColumn {
  Key = "key",
  ServiceCount = "serviceCount"
}

const MASK = "•".repeat(8);

// A revealed value is held against the version it was read from, so an edit hides it again.
const revealSlot = (variable: TAgentVaultVariable) => `${variable.id}:${variable.updatedAt}`;

const FADE_MS = 200;

const fadeClassName =
  "col-start-1 row-start-1 font-mono text-sm transition-[opacity,filter] duration-200 ease-out motion-reduce:transition-none";

// The value mounts hidden and fades in two frames later, once the hidden state has painted. Hiding fades it out
// first and only then takes it out of the DOM, so it is never kept longer than the fade.
//
// The box eases between the mask's width and the value's so the button beside it slides rather than jumps. Its width
// is pinned only while that runs: from where it is now to the text's width, capped at what the row leaves it, since
// easing towards a long value's full width would reach the cap in a frame or two and jump anyway. Once the motion is
// done the width goes back to auto.
const RevealableValue = ({ value }: { value?: string }) => {
  const [rendered, setRendered] = useState(value);
  const [isShown, setIsShown] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const maskRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (value !== undefined) {
      setRendered(value);
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setIsShown(true));
      });
      return () => cancelAnimationFrame(frame);
    }
    setIsShown(false);
    const timer = setTimeout(() => setRendered(undefined), FADE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const row = wrapper?.parentElement;
    const text = isShown ? valueRef.current : maskRef.current;
    if (!hasMounted.current || !wrapper || !row || !text) {
      hasMounted.current = true;
      return undefined;
    }

    const siblings = [...row.children].filter((child) => child !== wrapper);
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const available =
      row.clientWidth -
      siblings.reduce((total, child) => total + child.getBoundingClientRect().width + gap, 0);

    wrapper.style.width = `${wrapper.getBoundingClientRect().width}px`;
    // Commits the starting width, so the change below transitions from it.
    wrapper.getBoundingClientRect();
    wrapper.style.width = `${Math.min(text.scrollWidth, available)}px`;

    if (!isShown) return undefined;
    const timer = setTimeout(() => {
      wrapper.style.width = "";
    }, FADE_MS);
    return () => clearTimeout(timer);
  }, [isShown]);

  // The value enters the DOM before it is shown, and leaves after it is hidden. In both cases the box holds the mask's
  // width until the slide starts or after it ends, or auto would size it to the value for a frame.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (rendered === undefined) {
      wrapper.style.width = "";
    } else if (!isShown && maskRef.current) {
      wrapper.style.width = `${maskRef.current.scrollWidth}px`;
    }
    // Only the value entering or leaving matters here; isShown is read, not watched.
  }, [rendered]);

  return (
    <span
      ref={wrapperRef}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-center transition-[width] duration-200 ease-out motion-reduce:transition-none"
    >
      <span
        ref={maskRef}
        aria-hidden={isShown}
        className={twMerge(
          fadeClassName,
          "justify-self-start tracking-widest text-muted",
          isShown && "opacity-0 blur-[2px]"
        )}
      >
        {MASK}
      </span>
      {rendered !== undefined && (
        <span
          ref={valueRef}
          aria-hidden={!isShown}
          className={twMerge(fadeClassName, "truncate", !isShown && "opacity-0 blur-[2px]")}
        >
          {rendered}
        </span>
      )}
    </span>
  );
};

// Opens only when the column cuts the key off, measured as it opens.
const TruncatedKey = ({ value }: { value: string }) => {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Tooltip
      open={isOpen}
      onOpenChange={(next) => {
        const el = ref.current;
        setIsOpen(next && !!el && el.scrollWidth > el.clientWidth);
      }}
    >
      <TooltipTrigger asChild>
        <span ref={ref} className="block truncate font-mono text-sm">
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs font-mono break-all">{value}</TooltipContent>
    </Tooltip>
  );
};

type Props = {
  /** Personal for the caller's own variables, which only their personal values use. */
  scope?: AgentVaultVariableScope;
};

export const VariablesCard = ({ scope = AgentVaultVariableScope.Global }: Props) => {
  const isPersonal = scope === AgentVaultVariableScope.Personal;
  const revealValue = useRevealAgentVaultVariableValue();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [sortColumn, setSortColumn] = useState(SortColumn.Key);
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("ascending");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("agentVaultVariablesTable", PreferenceKey.PerPage, 20)
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [variableToEdit, setVariableToEdit] = useState<TAgentVaultVariable | null>(null);
  const [variableToDelete, setVariableToDelete] = useState<TAgentVaultVariable | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const searchTerm = debouncedSearch.trim();

  // The page goes back to 1 in the same render the debounced search lands in. Resetting it on the keystroke
  // instead would first request page 1 with the old search, and show that before the filtered results arrive.
  const [pagedSearchTerm, setPagedSearchTerm] = useState(searchTerm);
  if (pagedSearchTerm !== searchTerm) {
    setPagedSearchTerm(searchTerm);
    setPage(1);
  }
  const { data, isPending } = useListAgentVaultVariables({
    scope,
    search: searchTerm || undefined,
    orderBy: sortColumn,
    orderDirection: sortDirection === "ascending" ? "asc" : "desc",
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const displayed = data?.variables ?? [];
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });
  // A search narrows totalCount, so whether the cap is reached is read off an unfiltered count.
  const { data: unfilteredData } = useListAgentVaultVariables({ scope, limit: 1 });

  const handleSort = (column: SortColumn, direction: "ascending" | "descending" | "none") => {
    setPage(1);
    if (direction === "none") {
      setSortColumn(SortColumn.Key);
      setSortDirection("ascending");
      return;
    }
    setSortColumn(column);
    setSortDirection(direction);
  };

  const sortIconClassName = (column: SortColumn) =>
    twMerge(
      "size-3.5 transition-transform",
      sortColumn === column && sortDirection === "descending" && "rotate-180",
      sortColumn !== column && "opacity-30"
    );

  const toggleReveal = async (variable: TAgentVaultVariable) => {
    const slot = revealSlot(variable);
    if (revealed[slot] !== undefined) {
      setRevealed((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== slot)));
      return;
    }

    setRevealingId(variable.id);
    try {
      const value = await revealValue.mutateAsync(variable.id);
      setRevealed((prev) => ({ ...prev, [slot]: value }));
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    } finally {
      setRevealingId(null);
    }
  };

  // A value is fetched, and so audited, each time it is copied, and it is never shown. Safari lets a page write
  // the clipboard only inside the click that asked, so the value being fetched goes in as a pending ClipboardItem.
  // Older Firefox has no ClipboardItem, but still lets a page write text shortly after a click.
  const copyValue = async (variable: TAgentVaultVariable) => {
    let request: Promise<string> | undefined;
    try {
      request = revealValue.mutateAsync(variable.id);
      if (typeof ClipboardItem === "undefined") {
        await navigator.clipboard.writeText(await request);
      } else {
        const fetched = request.then((value) => new Blob([value], { type: "text/plain" }));
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": fetched })]);
      }
      createNotification({ text: `Copied the value of ${variable.key}`, type: "success" });
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast, so only a write the
      // browser refused needs one here
      const isRequestError = await request?.then(() => false).catch(() => true);
      if (!isRequestError) {
        createNotification({
          text: "Could not copy the value. Your browser blocked clipboard access.",
          type: "error"
        });
      }
    }
  };

  const hasVariables = totalCount > 0 || Boolean(searchTerm);
  const maxVariables = isPersonal ? MAX_PERSONAL_VARIABLES : MAX_VARIABLES;
  const isAtLimit = (unfilteredData?.totalCount ?? 0) >= maxVariables;

  const openForm = (variable: TAgentVaultVariable | null) => {
    setVariableToEdit(variable);
    setIsFormOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isPersonal ? "Personal Variables" : "Global Variables"}
          <DocumentationLinkBadge href={AgentVaultDocsUrls.variables} />
        </CardTitle>
        <CardDescription>
          {isPersonal ? (
            <>
              Your own values, for the services that ask each member for one. Use one as{" "}
              <code className="font-mono">{toVariableReference("KEY")}</code> when you set one up.
            </>
          ) : (
            <>
              A global variable stores one value that any service can use as{" "}
              <code className="font-mono">{toVariableReference("KEY")}</code>. Only admins can
              manage these and see their values.
            </>
          )}
        </CardDescription>
        <CardAction>
          {isAtLimit ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                <span tabIndex={0}>
                  <Button variant="av" isDisabled>
                    <PlusIcon />
                    Add {isPersonal ? "Personal" : "Global"} Variable
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {isPersonal
                  ? `You can keep at most ${maxVariables} personal variables. Delete an unused one first.`
                  : `Agent Vault can hold at most ${maxVariables} global variables. Delete an unused one first.`}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button variant="av" onClick={() => openForm(null)}>
              <PlusIcon />
              Add {isPersonal ? "Personal" : "Global"} Variable
            </Button>
          )}
        </CardAction>
      </CardHeader>

      {hasVariables && (
        <CardContent>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search variables..."
            />
          </InputGroup>
        </CardContent>
      )}

      {!isPending && displayed.length === 0 ? (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>
                {hasVariables ? "No variables match your search" : "No variables yet"}
              </EmptyTitle>
              <EmptyDescription>
                {hasVariables && "Try a different search term."}
                {!hasVariables &&
                  (isPersonal
                    ? "Add a variable to reuse one of your values across the services you set up."
                    : "Add a variable to use one value across services in any access bundle.")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        // Fixed layout, so revealing a secret can't resize the columns the way auto layout would.
        <Table className="w-full min-w-[640px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead
                className="w-[35%]"
                sortDirection={sortColumn === SortColumn.Key ? sortDirection : "none"}
                onSortChange={(direction) => handleSort(SortColumn.Key, direction)}
              >
                Key
                <ChevronDownIcon className={sortIconClassName(SortColumn.Key)} />
              </TableHead>
              <TableHead className="w-[35%]">Value</TableHead>
              <TableHead
                sortDirection={sortColumn === SortColumn.ServiceCount ? sortDirection : "none"}
                onSortChange={(direction) => handleSort(SortColumn.ServiceCount, direction)}
              >
                Used By
                <ChevronDownIcon className={sortIconClassName(SortColumn.ServiceCount)} />
              </TableHead>
              <TableHead variant="action" className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 3 }).map((_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`variable-skeleton-${index}`}>
                  {Array.from({ length: 3 }).map((__, cell) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableCell key={`variable-skeleton-${index}-${cell}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                  <TableCell variant="action" />
                </TableRow>
              ))}
            {!isPending &&
              displayed.map((variable) => {
                const revealedValue = revealed[revealSlot(variable)];
                const isRevealed = revealedValue !== undefined;
                return (
                  <TableRow key={variable.id}>
                    <TableCell>
                      <TruncatedKey value={variable.key} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <RevealableValue value={revealedValue} />
                        <IconButton
                          variant="ghost"
                          size="xs"
                          className="shrink-0"
                          aria-label={`${isRevealed ? "Hide" : "Reveal"} ${variable.key}`}
                          isPending={revealingId === variable.id}
                          onClick={() => toggleReveal(variable)}
                        >
                          {isRevealed ? <EyeOffIcon /> : <EyeIcon />}
                        </IconButton>
                      </div>
                    </TableCell>
                    <TableCell>
                      <UsedByBundleBadges usedByServices={variable.usedByServices} />
                    </TableCell>
                    <TableCell variant="action">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton variant="ghost" size="xs" aria-label="Open variable actions">
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent sideOffset={2} align="end">
                          <DropdownMenuItem onClick={() => copyValue(variable)}>
                            <CopyIcon />
                            Copy Value
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openForm(variable)}>
                            <PencilIcon />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="danger"
                            onClick={() => setVariableToDelete(variable)}
                          >
                            <TrashIcon />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      )}

      {totalCount > 0 && (
        <CardContent className="-mt-5 pt-0">
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={(newPerPage) => {
              setPerPage(newPerPage);
              setPage(1);
              setUserTablePreference("agentVaultVariablesTable", PreferenceKey.PerPage, newPerPage);
            }}
          />
        </CardContent>
      )}

      <VariableFormDialog
        scope={scope}
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        variable={variableToEdit}
      />

      <DeleteVariableDialog
        variable={variableToDelete}
        onOpenChange={(isOpen) => {
          if (!isOpen) setVariableToDelete(null);
        }}
      />
    </Card>
  );
};
