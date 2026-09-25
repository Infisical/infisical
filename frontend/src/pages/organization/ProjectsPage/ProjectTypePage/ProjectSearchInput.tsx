import { FocusEvent, KeyboardEvent, useRef, useState } from "react";
import { SearchIcon, ShieldAlertIcon } from "lucide-react";

import { SecretValueSearchSheet } from "@app/components/secrets/SecretValueSearchSheet";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useSlashFocusSearch } from "@app/hooks";

type Props = {
  orgId: string;
  value: string;
  onChange: (value: string) => void;
  canSearchByValue: boolean;
};

export const ProjectSearchInput = ({ orgId, value, onChange, canSearchByValue }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const valueSearchBtnRef = useRef<HTMLButtonElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isOptionHighlighted, setIsOptionHighlighted] = useState(false);
  const [isValueSearchOpen, setIsValueSearchOpen] = useState(false);
  useSlashFocusSearch(inputRef);

  const close = () => {
    setIsFocused(false);
    setIsOptionHighlighted(false);
  };

  const openValueSearch = () => {
    close();
    inputRef.current?.blur();
    setIsValueSearchOpen(true);
  };

  const input = (
    <InputGroup className="min-w-48 flex-1">
      <InputGroupAddon align="inline-start">
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        placeholder="Search by project name..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...(canSearchByValue && {
          onFocus: () => setIsFocused(true),
          onBlur: (e: FocusEvent<HTMLInputElement>) => {
            if (e.relatedTarget === valueSearchBtnRef.current) return;
            close();
          },
          onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
            if (!isFocused) return;
            if (e.key === "Tab" && !e.shiftKey) {
              e.preventDefault();
              valueSearchBtnRef.current?.focus();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setIsOptionHighlighted(true);
            } else if (e.key === "Enter" && isOptionHighlighted) {
              e.preventDefault();
              openValueSearch();
            } else if (e.key === "Escape") {
              close();
              inputRef.current?.blur();
            }
          }
        })}
      />
    </InputGroup>
  );

  // The page is shared across products; only Secret Management with the permission gets the option.
  if (!canSearchByValue) return input;

  return (
    <>
      <Popover open={isFocused}>
        <PopoverTrigger asChild>
          <div className="flex min-w-48 flex-1">{input}</div>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
            close();
          }}
        >
          <button
            ref={valueSearchBtnRef}
            type="button"
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground hover:bg-foreground/5",
              isOptionHighlighted && "bg-foreground/5"
            )}
            onFocus={() => setIsOptionHighlighted(true)}
            onBlur={close}
            onKeyDown={(e) => {
              if (e.key === "Tab" && e.shiftKey) {
                e.preventDefault();
                inputRef.current?.focus();
              }
            }}
            onClick={openValueSearch}
          >
            <ShieldAlertIcon className="size-4 shrink-0 text-muted" />
            <span className="truncate">Search by secret value</span>
          </button>
        </PopoverContent>
      </Popover>
      <SecretValueSearchSheet
        orgId={orgId}
        isOpen={isValueSearchOpen}
        onOpenChange={setIsValueSearchOpen}
      />
    </>
  );
};
