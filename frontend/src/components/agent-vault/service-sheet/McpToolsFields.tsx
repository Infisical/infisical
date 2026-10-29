import { useEffect, useId, useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { CircleXIcon, PlusIcon, RefreshCwIcon, SearchIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  RadioGroup,
  RadioGroupItem,
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
import { useListAgentVaultMcpTools } from "@app/hooks/api/agentVault";
import { TAgentVaultMcpTool } from "@app/hooks/api/agentVault/types";

import { buildListMcpToolsRequest } from "./serviceRequest";
import { MAX_ALLOWED_TOOLS, McpToolScope, toolNameError, TServiceForm } from "./serviceSchema";
import { serverMessage } from "./useOAuthAuthorize";

/**
 * A loaded list belongs to the request that loaded it, so a changed URL, transport, credential or custom
 * header needs a new load.
 */
export type TLoadedMcpTools = { source: string; tools: TAgentVaultMcpTool[] };

const SCOPE_CHOICES = [
  {
    value: McpToolScope.All,
    title: "All tools",
    description: "Agents can call every tool the server offers, including ones it adds later."
  },
  {
    value: McpToolScope.Selected,
    title: "Selected tools",
    description: "Agents can call only the tools you select."
  }
];

const PER_PAGE = 10;

type TToolRow = { name: string; description: string | null; isUnlisted: boolean };

type Props = {
  accessBundleId: string;
  serviceId?: string;
  loaded: TLoadedMcpTools | null;
  onLoaded: (loaded: TLoadedMcpTools) => void;
};

export const McpToolsFields = ({ accessBundleId, serviceId, loaded, onLoaded }: Props) => {
  const { control, getValues, setValue, clearErrors, formState } = useFormContext<TServiceForm>();
  const form = useWatch({ control }) as TServiceForm;
  const { toolScope, allowedTools } = form;
  const listTools = useListAgentVaultMcpTools();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  // Unchecking a tool the server doesn't list keeps its row, so a slip is undone without retyping the name.
  const [addedNames, setAddedNames] = useState<string[]>([]);
  const baseId = useId();

  const toolsSource = (data: TServiceForm) =>
    JSON.stringify(buildListMcpToolsRequest(accessBundleId, serviceId, data));
  const source = toolsSource(form);
  const serverTools = loaded?.source === source ? loaded.tools : null;
  // Each connection is loaded on its own once; after a failure the admin retries with the button.
  const [autoLoadedSource, setAutoLoadedSource] = useState<string | null>(null);

  // Selected tools go first in the order they were in when the list loaded, not live, so a row doesn't jump away
  // from under the pointer when it is checked.
  const [pinnedNames, setPinnedNames] = useState(() => new Set(allowedTools));
  useEffect(() => {
    setPinnedNames(new Set(getValues("allowedTools")));
  }, [serverTools, getValues]);

  const rows = useMemo<TToolRow[]>(() => {
    const listed = serverTools ?? [];
    const listedNames = new Set(listed.map((tool) => tool.name));
    // First, so a saved tool the server dropped is the first thing the admin sees.
    const savedNames = (formState.defaultValues?.allowedTools ?? []).filter(
      (name): name is string => Boolean(name)
    );
    const unlisted = [...new Set([...savedNames, ...addedNames, ...allowedTools])]
      .filter((name) => !listedNames.has(name))
      .map((name) => ({ name, description: null, isUnlisted: serverTools !== null }));
    const listedRows = listed.map((tool) => ({ ...tool, isUnlisted: false }));
    return [
      ...unlisted,
      ...listedRows.filter((row) => pinnedNames.has(row.name)),
      ...listedRows.filter((row) => !pinnedNames.has(row.name))
    ];
  }, [serverTools, allowedTools, addedNames, formState.defaultValues, pinnedNames]);

  const term = query.trim();
  const shownRows = useMemo(() => {
    const lowered = term.toLowerCase();
    if (!lowered) return rows;
    return rows.filter((row) =>
      [row.name, row.description ?? ""].some((text) => text.toLowerCase().includes(lowered))
    );
  }, [rows, term]);
  // What was typed becomes a tool only when no row already has that exact name.
  const termError = term ? toolNameError(term) : null;
  const canAdd = Boolean(term) && !termError && !rows.some((row) => row.name === term);

  const pageCount = Math.max(1, Math.ceil(shownRows.length / PER_PAGE));
  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);
  const pageRows = shownRows.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  const selected = new Set(allowedTools);
  const pageUnselectedNames = pageRows.map((row) => row.name).filter((name) => !selected.has(name));
  const pageSelectedCount = pageRows.length - pageUnselectedNames.length;
  const canSelectPage = allowedTools.length + pageUnselectedNames.length <= MAX_ALLOWED_TOOLS;

  const setAllowedTools = (next: string[]) => {
    setValue("allowedTools", next, { shouldDirty: true });
    clearErrors("allowedTools");
  };

  const toggleTool = (name: string, isChecked: boolean) =>
    setAllowedTools(
      isChecked ? [...allowedTools, name] : allowedTools.filter((tool) => tool !== name)
    );

  const togglePage = (isChecked: boolean) => {
    const pageNames = new Set(pageRows.map((row) => row.name));
    setAllowedTools(
      isChecked
        ? [...allowedTools, ...pageUnselectedNames]
        : allowedTools.filter((name) => !pageNames.has(name))
    );
  };

  const loadTools = async () => {
    setLoadError(null);
    const request = buildListMcpToolsRequest(accessBundleId, serviceId, getValues());
    // Serialized before the request: field edits mutate nested form values in place.
    const requestSource = JSON.stringify(request);
    // A response for a connection the admin has since changed would replace the current one's list.
    const isCurrent = () => toolsSource(getValues()) === requestSource;
    try {
      const tools = await listTools.mutateAsync(request);
      if (isCurrent()) onLoaded({ source: requestSource, tools });
    } catch (error) {
      if (isCurrent()) {
        setLoadError(serverMessage(error) ?? "The server's tools couldn't be loaded. Try again.");
      }
    }
  };

  useEffect(() => {
    if (toolScope !== McpToolScope.Selected || serverTools || autoLoadedSource === source) return;
    setAutoLoadedSource(source);
    loadTools();
  }, [toolScope, serverTools, autoLoadedSource, source]);

  const addTyped = () => {
    if (!canAdd) return;
    setAllowedTools([...allowedTools, term]);
    setAddedNames((names) => [...names, term]);
    setQuery("");
  };

  const selectedCount = (
    <span className="text-xs whitespace-nowrap text-muted">{allowedTools.length} selected</span>
  );

  let emptyTitle = "No tools selected";
  let emptyDescription =
    "Load the server's tools to pick from them, or type a tool's name above to add it.";
  if (listTools.isPending && !term) {
    emptyTitle = "Loading the server's tools";
    emptyDescription = "You can type a tool's name above to add it in the meantime.";
  } else if (term) {
    emptyTitle = `No tools match "${term}"`;
    emptyDescription = termError ?? "Try a different search.";
  } else if (serverTools) {
    emptyTitle = "The server lists no tools";
    emptyDescription = "Type a tool's name above to add it.";
  }

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={control}
        name="toolScope"
        render={({ field }) => (
          <Field>
            <FieldLabel>Allowed Tools</FieldLabel>
            <FieldContent>
              <RadioGroup value={field.value} onValueChange={field.onChange}>
                {SCOPE_CHOICES.map((choice) => {
                  const id = `${baseId}-scope-${choice.value}`;
                  return (
                    <FieldLabel key={choice.value} htmlFor={id} variant="av">
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>{choice.title}</FieldTitle>
                          <FieldDescription>{choice.description}</FieldDescription>
                        </FieldContent>
                        <RadioGroupItem id={id} value={choice.value} />
                      </Field>
                    </FieldLabel>
                  );
                })}
              </RadioGroup>
            </FieldContent>
          </Field>
        )}
      />

      {toolScope === McpToolScope.Selected && (
        <Controller
          control={control}
          name="allowedTools"
          render={({ fieldState }) => (
            <Field>
              <FieldLabel htmlFor={`${baseId}-query`}>Tools</FieldLabel>
              <FieldContent className="gap-3">
                <div className="flex items-center gap-2">
                  <InputGroup className="flex-1">
                    <InputGroupAddon>
                      <SearchIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                      id={`${baseId}-query`}
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        addTyped();
                      }}
                      placeholder="Search or add a tool..."
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </InputGroup>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={loadTools}
                    isPending={listTools.isPending}
                  >
                    <RefreshCwIcon />
                    {serverTools ? "Reload Tools" : "Load Tools"}
                  </Button>
                </div>

                {loadError && (
                  <Alert variant="danger">
                    <CircleXIcon />
                    <AlertTitle>Couldn&apos;t load the tools</AlertTitle>
                    <AlertDescription>
                      {loadError} You can still add a tool by typing its name.
                    </AlertDescription>
                  </Alert>
                )}

                {shownRows.length === 0 && !canAdd ? (
                  <Empty className="border">
                    <EmptyHeader>
                      <EmptyTitle>{emptyTitle}</EmptyTitle>
                      <EmptyDescription>{emptyDescription}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div aria-invalid={Boolean(fieldState.error)} className="flex flex-col gap-3">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            {/* In a form, Radix adds a hidden input after the checkbox; a flex parent keeps it level
                            with the checkbox instead of below it, where it overflows the table. */}
                            <div className="flex">
                              <Checkbox
                                id={`${baseId}-all`}
                                aria-label="Select every tool on this page"
                                isChecked={pageSelectedCount > 0}
                                isIndeterminate={
                                  pageSelectedCount > 0 && pageSelectedCount < pageRows.length
                                }
                                isDisabled={
                                  pageRows.length === 0 ||
                                  (pageSelectedCount < pageRows.length && !canSelectPage)
                                }
                                onCheckedChange={() =>
                                  togglePage(pageSelectedCount < pageRows.length)
                                }
                              />
                            </div>
                          </TableHead>
                          <TableHead className="w-2/5">Name</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {canAdd && (
                          <TableRow className="cursor-pointer" onClick={addTyped}>
                            <TableCell>
                              <PlusIcon className="size-4 text-accent" aria-hidden="true" />
                            </TableCell>
                            <TableCell colSpan={2} className="max-w-0">
                              <button
                                type="button"
                                className="block w-full truncate text-left"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addTyped();
                                }}
                              >
                                Add <span className="font-mono">{term}</span>
                              </button>
                            </TableCell>
                          </TableRow>
                        )}
                        {pageRows.map((row) => {
                          const isSelected = selected.has(row.name);
                          return (
                            <TableRow
                              key={row.name}
                              data-state={isSelected ? "selected" : undefined}
                              className="cursor-pointer"
                              onClick={() => toggleTool(row.name, !isSelected)}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <div className="flex">
                                  <Checkbox
                                    id={`${baseId}-tool-${row.name}`}
                                    aria-label={`Select ${row.name}`}
                                    isChecked={isSelected}
                                    onCheckedChange={(checked) =>
                                      toggleTool(row.name, checked === true)
                                    }
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="max-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate font-mono" title={row.name}>
                                    {row.name}
                                  </span>
                                  {row.isUnlisted && <Badge variant="neutral">Custom</Badge>}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-0">
                                {row.description ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="truncate text-muted">{row.description}</div>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-lg">
                                      {row.description}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {shownRows.length > PER_PAGE ? (
                      <Pagination
                        count={shownRows.length}
                        page={currentPage}
                        perPage={PER_PAGE}
                        perPageList={[PER_PAGE]}
                        onChangePage={setCurrentPage}
                        onChangePerPage={() => {}}
                        startAdornment={selectedCount}
                      />
                    ) : (
                      selectedCount
                    )}
                  </div>
                )}

                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      )}
    </div>
  );
};
