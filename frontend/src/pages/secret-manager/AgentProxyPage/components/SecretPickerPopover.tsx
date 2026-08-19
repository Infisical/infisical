import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  FolderIcon,
  KeyIcon,
  LayersIcon
} from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useProject } from "@app/context";
import { useDebounce } from "@app/hooks";
import { useGetProjectFolders, useGetProjectSecrets } from "@app/hooks/api";
import { useGetProjectSecretsQuickSearch } from "@app/hooks/api/dashboard";

export type TSecretSelection = {
  environment: string;
  secretPath: string;
  secretKey: string;
};

type Props = {
  value?: TSecretSelection;
  onChange: (selection: TSecretSelection) => void;
  isError?: boolean;
};

type TPickerItem =
  | { kind: "environment"; id: string; environment: string; name: string }
  | { kind: "folder"; id: string; environment: string; name: string; path: string }
  | { kind: "secret"; id: string; environment: string; secretPath: string; secretKey: string };

type TPickerSection = { label: string; items: TPickerItem[]; withLocation?: boolean };

// the deep search endpoint slices every resource type to 25, so a full section means there is more
// behind it than we can show
const DEEP_SEARCH_LIMIT = 25;

const joinPath = (base: string, folder: string) =>
  base === "/" ? `/${folder}` : `${base}/${folder}`;

const parentPath = (path: string) => {
  if (path === "/") return "/";
  const segments = path.split("/").filter(Boolean);
  segments.pop();
  return segments.length ? `/${segments.join("/")}` : "/";
};

const formatLocation = (environment: string, secretPath: string) =>
  `${environment}${secretPath === "/" ? "" : secretPath}`;

const formatSelection = ({ environment, secretPath, secretKey }: TSecretSelection) =>
  `${formatLocation(environment, secretPath)}/${secretKey}`;

// Searches the project the same way the secret reference wizard does: one input that matches secrets,
// folders and environments anywhere in the project, with folder browsing when nothing is typed. It
// returns the three fields a policy credential stores rather than a reference string, which is the
// only reason it isn't that component.
export const SecretPickerPopover = ({ value, onChange, isError }: Props) => {
  const { currentProject, projectId } = useProject();
  const { environments } = currentProject;

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  // null means the field hasn't been typed in since it was opened, so it mirrors the current selection
  const [draft, setDraft] = useState<string | null>(null);
  const [browseEnvironment, setBrowseEnvironment] = useState<string | null>(null);
  const [browsePath, setBrowsePath] = useState("/");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const search = (draft ?? "").trim();
  const [debouncedSearch] = useDebounce(search, 200);
  const isSearching = Boolean(search);
  const isBrowsing = Boolean(browseEnvironment) && !isSearching;

  const { data: folders } = useGetProjectFolders({
    projectId,
    environment: browseEnvironment ?? "",
    path: browsePath,
    options: { enabled: isOpen && isBrowsing }
  });

  const { data: secrets } = useGetProjectSecrets({
    projectId,
    environment: browseEnvironment ?? "",
    secretPath: browsePath,
    viewSecretValue: false,
    options: { enabled: isOpen && isBrowsing }
  });

  const { data: searchResults, isFetching: isSearchFetching } = useGetProjectSecretsQuickSearch(
    {
      projectId,
      secretPath: "/",
      environments: environments.map((environment) => environment.slug),
      search: debouncedSearch,
      tags: {}
    },
    { enabled: isOpen && isSearching }
  );

  const sections = useMemo<TPickerSection[]>(() => {
    if (isSearching) {
      const query = search.toLowerCase();
      const environmentBySlug = new Map(environments.map((env) => [env.id, env.slug]));

      const matchedSecrets = Object.values(searchResults?.secrets ?? {}).flat();
      const matchedFolders = Object.values(searchResults?.folders ?? {}).flat();
      const matchedEnvironments = environments.filter(
        (env) => env.name.toLowerCase().includes(query) || env.slug.toLowerCase().includes(query)
      );

      return [
        {
          label: "Secrets",
          withLocation: true,
          items: matchedSecrets.map(
            (secret): TPickerItem => ({
              kind: "secret",
              id: secret.id,
              environment: secret.env,
              secretPath: secret.path ?? "/",
              secretKey: secret.key
            })
          )
        },
        {
          label: "Folders",
          withLocation: true,
          items: matchedFolders.map(
            (folder): TPickerItem => ({
              kind: "folder",
              id: folder.id,
              environment: environmentBySlug.get(folder.envId) ?? "",
              name: folder.name,
              path: folder.path
            })
          )
        },
        {
          label: "Environments",
          items: matchedEnvironments.map(
            (env): TPickerItem => ({
              kind: "environment",
              id: env.id,
              environment: env.slug,
              name: env.name
            })
          )
        }
      ].filter((section) => section.items.length > 0);
    }

    if (!browseEnvironment) {
      return [
        {
          label: "Environments",
          items: environments.map(
            (env): TPickerItem => ({
              kind: "environment",
              id: env.id,
              environment: env.slug,
              name: env.name
            })
          )
        }
      ];
    }

    return [
      {
        label: "Folders",
        items: (folders ?? []).map(
          (folder): TPickerItem => ({
            kind: "folder",
            id: folder.id,
            environment: browseEnvironment,
            name: folder.name,
            path: joinPath(browsePath, folder.name)
          })
        )
      },
      {
        label: "Secrets",
        items: (secrets ?? []).map(
          (secret): TPickerItem => ({
            kind: "secret",
            id: secret.id,
            environment: browseEnvironment,
            secretPath: browsePath,
            secretKey: secret.key
          })
        )
      }
    ].filter((section) => section.items.length > 0);
  }, [
    isSearching,
    search,
    searchResults,
    environments,
    browseEnvironment,
    browsePath,
    folders,
    secrets
  ]);

  const flatItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  const sectionOffsets = useMemo(() => {
    let offset = 0;
    return sections.map((section) => {
      const start = offset;
      offset += section.items.length;
      return start;
    });
  }, [sections]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [flatItems.length, browseEnvironment, browsePath, isSearching]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-nav-index="${highlightedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const handleOpen = () => {
    if (isOpen) return;
    setIsOpen(true);
    setDraft(null);
    // reopening on a filled credential should land where that secret lives, not at the top
    setBrowseEnvironment(value?.environment ?? null);
    setBrowsePath(value?.secretPath ?? "/");
  };

  const handleClose = () => {
    setIsOpen(false);
    setDraft(null);
  };

  const handleSelect = (item: TPickerItem) => {
    if (item.kind === "secret") {
      onChange({
        environment: item.environment,
        secretPath: item.secretPath,
        secretKey: item.secretKey
      });
      setDraft(null);
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }

    setBrowseEnvironment(item.environment);
    setBrowsePath(item.kind === "folder" ? item.path : "/");
    setDraft(null);
    inputRef.current?.focus();
  };

  const handleNavigateUp = () => {
    if (browsePath === "/") setBrowseEnvironment(null);
    else setBrowsePath(parentPath(browsePath));
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (!isOpen) return;
      // the sheet closes on escape too, so keep this one from reaching it
      e.preventDefault();
      e.stopPropagation();
      handleClose();
      return;
    }

    if (!isOpen) {
      if (e.key === "ArrowDown") handleOpen();
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!flatItems.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlightedIndex((prev) => (prev + step + flatItems.length) % flatItems.length);
      return;
    }

    if (e.key === "Enter") {
      // this input sits inside the policy form, so enter picks a row instead of submitting it
      e.preventDefault();
      const item = flatItems[highlightedIndex];
      if (item) handleSelect(item);
    }
  };

  const selectAllWhenPristine = () => {
    if (draft === null) inputRef.current?.select();
  };

  const isSelected = (item: TPickerItem) =>
    item.kind === "secret" &&
    value?.environment === item.environment &&
    value?.secretPath === item.secretPath &&
    value?.secretKey === item.secretKey;

  const isCapped =
    isSearching && sections.some((section) => section.items.length >= DEEP_SEARCH_LIMIT);

  const browseEnvironmentName = environments.find((env) => env.slug === browseEnvironment)?.name;

  const emptyMessage = (() => {
    if (!isSearching) return "Nothing here";
    return isSearchFetching || debouncedSearch !== search
      ? "Searching..."
      : `No matches for “${search}”`;
  })();

  return (
    <Popover open={isOpen}>
      <PopoverTrigger asChild>
        <div className="w-full">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <KeyIcon />
            </InputGroupAddon>
            <InputGroupInput
              ref={inputRef}
              role="combobox"
              aria-expanded={isOpen}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search for a secret..."
              isError={isError}
              value={draft ?? (value?.secretKey ? formatSelection(value) : "")}
              onChange={(e) => {
                setDraft(e.target.value);
                // typing after escape reopens without resetting what was just typed
                setIsOpen(true);
              }}
              onFocus={() => {
                handleOpen();
                selectAllWhenPristine();
              }}
              onClick={() => {
                handleOpen();
                selectAllWhenPristine();
              }}
              onKeyDown={handleKeyDown}
              onBlur={handleClose}
            />
          </InputGroup>
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[var(--radix-popover-trigger-width)] min-w-80 p-0"
      >
        {isBrowsing && (
          <div className="flex items-center gap-2 border-b border-border p-2">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleNavigateUp();
              }}
              className="cursor-pointer text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeftIcon className="size-3.5" />
            </button>
            <span className="truncate font-mono text-xs text-muted">
              {browseEnvironmentName ?? browseEnvironment}
              {browsePath === "/" ? "/" : browsePath}
            </span>
          </div>
        )}
        <div
          ref={listRef}
          className="max-h-72 thin-scrollbar overflow-x-hidden overflow-y-auto py-1"
        >
          {!flatItems.length && (
            <div className="flex items-center justify-center px-2 py-6 text-center text-sm text-muted">
              {emptyMessage}
            </div>
          )}
          {sections.map((section, sectionIndex) => (
            <div key={section.label}>
              <div className="px-2 py-1.5 text-[10px] font-semibold tracking-wider text-muted uppercase">
                {section.label}
              </div>
              {section.items.map((item, itemIndex) => {
                const navIndex = sectionOffsets[sectionIndex] + itemIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-nav-index={navIndex}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(item);
                    }}
                    onMouseEnter={() => setHighlightedIndex(navIndex)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 px-2 py-2 text-left text-sm transition-colors",
                      highlightedIndex === navIndex && "bg-foreground/10"
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {item.kind === "environment" && (
                        <LayersIcon className="size-4 shrink-0 text-muted" />
                      )}
                      {item.kind === "folder" && (
                        <FolderIcon className="size-4 shrink-0 text-folder" />
                      )}
                      {item.kind === "secret" && (
                        <KeyIcon className="size-4 shrink-0 text-secret" />
                      )}
                      <span className="truncate">
                        {item.kind === "secret" ? item.secretKey : item.name}
                      </span>
                    </div>
                    {section.withLocation && item.kind !== "environment" && (
                      <span className="max-w-[45%] truncate font-mono text-[11px] text-muted">
                        {item.kind === "secret"
                          ? formatLocation(item.environment, item.secretPath)
                          : formatLocation(item.environment, parentPath(item.path))}
                      </span>
                    )}
                    {isSelected(item) && <CheckIcon className="size-3.5 shrink-0 text-accent" />}
                    {item.kind !== "secret" && (
                      <ChevronRightIcon className="size-3.5 shrink-0 text-muted" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {isCapped && (
          <div className="border-t border-border px-2 py-1.5 text-[11px] text-muted">
            Showing the first {DEEP_SEARCH_LIMIT} matches. Keep typing to narrow them down.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
