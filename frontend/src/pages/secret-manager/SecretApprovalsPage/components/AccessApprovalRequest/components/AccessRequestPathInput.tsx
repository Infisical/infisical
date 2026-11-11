import { useMemo, useRef, useState } from "react";
import { FolderIcon, FolderTreeIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  Popover,
  PopoverAnchor,
  PopoverContent
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { isGlobSubsetOfGlob } from "@app/lib/fn/glob";

import { ENTIRE_SCOPE_PATH } from "../AccessApprovalRequest.utils";

type TSuggestion = { path: string; hint?: string };

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  folderPaths: string[];
  policyPaths: string[];
  isError: boolean;
};

export const AccessRequestPathInput = ({
  id,
  value,
  onChange,
  onFocus,
  onBlur,
  folderPaths,
  policyPaths,
  isError
}: Props) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // A folder outside every policy is still offered when a covered folder sits below it, so the
  // requester can drill down to a policy that only covers a nested path.
  const navigableFolders = useMemo(() => {
    const coveredFolders = folderPaths.filter((folderPath) =>
      policyPaths.some((policyPath) => isGlobSubsetOfGlob(policyPath, folderPath))
    );
    return folderPaths.filter((folderPath) =>
      coveredFolders.some(
        (covered) => covered === folderPath || covered.startsWith(`${folderPath}/`)
      )
    );
  }, [folderPaths, policyPaths]);

  const suggestions = useMemo(() => {
    const trimmed = value.trim();
    const typed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    const dir =
      typed !== "/" && navigableFolders.includes(typed)
        ? `${typed}/`
        : typed.slice(0, typed.lastIndexOf("/") + 1);
    const prefix = typed.slice(dir.length).toLowerCase();

    const folderSuggestions: TSuggestion[] = navigableFolders
      .filter((folderPath) => {
        const rest = folderPath.slice(dir.length);
        return (
          folderPath.startsWith(dir) &&
          rest.length > 0 &&
          !rest.includes("/") &&
          rest.toLowerCase().startsWith(prefix)
        );
      })
      .sort((a, b) => a.localeCompare(b))
      .map((path) => ({ path }));

    const base = dir === "/" ? "" : dir.slice(0, -1);
    const globPath = `${base}/**`;
    if (
      globPath !== typed &&
      folderPaths.some((folderPath) => folderPath !== "/" && folderPath.startsWith(dir)) &&
      policyPaths.some((policyPath) => isGlobSubsetOfGlob(policyPath, globPath))
    ) {
      folderSuggestions.push({
        path: globPath,
        hint: globPath === ENTIRE_SCOPE_PATH ? "Entire environment" : `All folders in ${base}`
      });
    }

    return folderSuggestions;
  }, [value, navigableFolders, folderPaths, policyPaths]);

  const isEntireScope = value.trim() === ENTIRE_SCOPE_PATH;

  const selectSuggestion = (suggestion: TSuggestion) => {
    onChange(suggestion.path);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.preventDefault();
    if (!isFocused || !suggestions.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === "Enter" && suggestions[highlightedIndex]) {
      selectSuggestion(suggestions[highlightedIndex]);
    }
  };

  return (
    <Popover
      open={isFocused && suggestions.length > 0}
      onOpenChange={(open) => {
        if (!open) setIsFocused(false);
        setHighlightedIndex(-1);
      }}
    >
      <PopoverAnchor asChild>
        <InputGroup ref={anchorRef}>
          <InputGroupAddon>
            <InputGroupText>
              {isEntireScope ? (
                <FolderTreeIcon className="text-warning" />
              ) : (
                <FolderIcon className="text-folder" />
              )}
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            id={id}
            type="text"
            autoComplete="off"
            placeholder="/folder/subfolder"
            className="font-mono"
            value={value}
            isError={isError}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setIsFocused(true);
              onFocus();
            }}
            onBlur={() => {
              setIsFocused(false);
              onBlur();
            }}
            onChange={(e) => {
              setIsFocused(true);
              setHighlightedIndex(-1);
              onChange(e.target.value);
            }}
          />
        </InputGroup>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        style={{
          width: "var(--radix-popover-trigger-width)",
          maxHeight: "var(--radix-popover-content-available-height)"
        }}
      >
        <div className="max-h-[25vh] thin-scrollbar overflow-y-auto">
          {suggestions.map((suggestion, i) => (
            <button
              type="button"
              key={suggestion.path}
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(suggestion);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-foreground transition-colors hover:bg-foreground/10",
                highlightedIndex === i && "bg-foreground/10"
              )}
            >
              {suggestion.hint ? (
                <FolderTreeIcon className="size-3.5 shrink-0 text-muted" />
              ) : (
                <FolderIcon className="size-3.5 shrink-0 text-folder" />
              )}
              <span className="truncate font-mono text-sm">{suggestion.path}</span>
              {suggestion.hint && (
                <span className="ml-auto shrink-0 text-xs text-muted">{suggestion.hint}</span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
