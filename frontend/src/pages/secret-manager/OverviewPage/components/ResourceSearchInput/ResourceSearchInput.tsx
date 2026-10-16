import { useEffect, useRef, useState } from "react";
import { GlobeIcon, SearchIcon, XIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useDebounce, useSlashFocusSearch } from "@app/hooks";

import { QuickSearchModal, QuickSearchModalProps } from "../SecretSearchInput/components";
import { getResourceSearchStateTransition } from "./resourceSearchState";

type Props = Omit<QuickSearchModalProps, "isOpen" | "onClose" | "onOpenChange" | "initialValue"> & {
  value: string;
  onChange: (search: string) => void;
  className?: string;
  isSearchAllFoldersOpen?: boolean;
  onSearchAllFoldersOpenChange?: (isOpen: boolean) => void;
};

export const ResourceSearchInput = ({
  value: externalValue,
  onChange,
  className,
  isSingleEnv,
  isSearchAllFoldersOpen,
  onSearchAllFoldersOpenChange,
  ...props
}: Props) => {
  const [isInternalOpen, setIsInternalOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isOptionHighlighted, setIsOptionHighlighted] = useState(false);
  const deepSearchBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useSlashFocusSearch(inputRef);

  // local input state so typing doesn't re-render the whole table
  const [inputValue, setInputValue] = useState(externalValue);
  const [debouncedInputValue] = useDebounce(inputValue);
  const previousExternalValue = useRef(externalValue);
  const lastEmittedValue = useRef(externalValue);

  useEffect(() => {
    const transition = getResourceSearchStateTransition({
      externalValue,
      previousExternalValue: previousExternalValue.current,
      debouncedInputValue,
      lastEmittedValue: lastEmittedValue.current
    });

    if (!transition) return;

    if (transition.type === "sync") {
      previousExternalValue.current = transition.value;
      lastEmittedValue.current = transition.value;
      setInputValue(transition.value);
      return;
    }

    lastEmittedValue.current = transition.value;
    onChange(transition.value);
  }, [debouncedInputValue, externalValue, onChange]);

  const handleClear = () => {
    setInputValue("");
    lastEmittedValue.current = "";
    onChange("");
  };

  const hasSearch = Boolean(inputValue.trim());
  const isOpen = isSearchAllFoldersOpen ?? isInternalOpen;
  const handleOpenChange = (open: boolean) => {
    if (isSearchAllFoldersOpen === undefined) setIsInternalOpen(open);
    onSearchAllFoldersOpenChange?.(open);
  };

  return (
    <>
      <Popover open={isFocused}>
        <PopoverTrigger asChild>
          <div className={cn("w-full", className)}>
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                ref={inputRef}
                autoComplete="off"
                placeholder={
                  isSingleEnv
                    ? "Search by secret, folder, tag or metadata..."
                    : "Search by secret or folder name..."
                }
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setIsOptionHighlighted(false);
                }}
                onFocus={() => {
                  setIsFocused(true);
                }}
                onBlur={(e) => {
                  if (e.relatedTarget === deepSearchBtnRef.current) return;
                  setIsFocused(false);
                  setIsOptionHighlighted(false);
                }}
                onKeyDown={(e) => {
                  if (!isFocused) return;

                  if (e.key === "Tab" && !e.shiftKey) {
                    e.preventDefault();
                    deepSearchBtnRef.current?.focus();
                  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setIsOptionHighlighted(true);
                  } else if (e.key === "Enter" && isOptionHighlighted) {
                    e.preventDefault();
                    handleOpenChange(true);
                    setIsFocused(false);
                    setIsOptionHighlighted(false);
                  } else if (e.key === "Escape") {
                    setIsFocused(false);
                    setIsOptionHighlighted(false);
                    inputRef.current?.blur();
                  }
                }}
              />
              {hasSearch && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton aria-label="Clear search" onClick={handleClear}>
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
          </div>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
            setIsFocused(false);
            setIsOptionHighlighted(false);
          }}
        >
          <button
            ref={deepSearchBtnRef}
            type="button"
            className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground hover:bg-foreground/5 ${isOptionHighlighted ? "bg-foreground/5" : ""}`}
            onFocus={() => setIsOptionHighlighted(true)}
            onBlur={() => {
              setIsOptionHighlighted(false);
              setIsFocused(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Tab" && e.shiftKey) {
                e.preventDefault();
                inputRef.current?.focus();
              }
            }}
            onClick={() => {
              handleOpenChange(true);
              setIsFocused(false);
              setIsOptionHighlighted(false);
            }}
          >
            <GlobeIcon className="size-4 shrink-0 text-muted" />
            <span className="truncate">
              {hasSearch ? `Search all folders for "${inputValue.trim()}"` : "Search all folders"}
            </span>
          </button>
        </PopoverContent>
      </Popover>
      <QuickSearchModal
        isSingleEnv={isSingleEnv}
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        initialValue={inputValue}
        onClose={(clearSearch = true) => {
          handleOpenChange(false);
          if (clearSearch) handleClear();
        }}
        {...props}
      />
    </>
  );
};
