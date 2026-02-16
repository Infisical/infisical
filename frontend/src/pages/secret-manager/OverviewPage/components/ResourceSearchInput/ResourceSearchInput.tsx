import { useRef, useState } from "react";
import { GlobeIcon, SearchIcon, XIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableButtonGroup,
  UnstableIconButton
} from "@app/components/v3";

import { QuickSearchModal, QuickSearchModalProps } from "../SecretSearchInput/components";

type Props = Omit<QuickSearchModalProps, "isOpen" | "onClose" | "onOpenChange" | "initialValue"> & {
  value: string;
  onChange: (search: string) => void;
  className?: string;
};

export const ResourceSearchInput = ({
  value,
  onChange,
  className,
  isSingleEnv,
  ...props
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isOptionHighlighted, setIsOptionHighlighted] = useState(false);
  const deepSearchBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasSearch = Boolean(value.trim());

  return (
    <>
      <UnstableButtonGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <UnstableIconButton variant="outline" onClick={() => setIsOpen(true)}>
              <SearchIcon />
            </UnstableIconButton>
          </TooltipTrigger>
          <TooltipContent>Search All Folders</TooltipContent>
        </Tooltip>
        <Popover open={hasSearch && isFocused}>
          <PopoverTrigger asChild>
            <div>
              <InputGroup className="w-[270px] rounded-l-none">
                <InputGroupInput
                  ref={inputRef}
                  autoComplete="off"
                  placeholder={
                    isSingleEnv
                      ? "Search by secret, folder, tag or metadata..."
                      : "Search by secret or folder name..."
                  }
                  value={value}
                  onChange={(e) => {
                    onChange(e.target.value);
                    setIsOptionHighlighted(false);
                  }}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => {
                    setIsFocused(false);
                    setIsOptionHighlighted(false);
                  }}
                  onKeyDown={(e) => {
                    if (!hasSearch || !isFocused) return;

                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      setIsOptionHighlighted(true);
                    } else if (e.key === "Enter" && isOptionHighlighted) {
                      e.preventDefault();
                      setIsOpen(true);
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
                    <UnstableIconButton variant="ghost" size="xs" onClick={() => onChange("")}>
                      <XIcon />
                    </UnstableIconButton>
                  </InputGroupAddon>
                )}
              </InputGroup>
            </div>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[270px] p-1"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <button
              ref={deepSearchBtnRef}
              type="button"
              className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground hover:bg-foreground/5 ${isOptionHighlighted ? "bg-foreground/5" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                setIsOpen(true);
                setIsFocused(false);
                setIsOptionHighlighted(false);
              }}
            >
              <GlobeIcon className="size-4 shrink-0 text-muted" />
              <span className="truncate">Search all folders for &quot;{value.trim()}&quot;</span>
            </button>
          </PopoverContent>
        </Popover>
      </UnstableButtonGroup>
      <QuickSearchModal
        isSingleEnv={isSingleEnv}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        initialValue={value}
        onClose={() => {
          setIsOpen(false);
          onChange("");
        }}
        {...props}
      />
    </>
  );
};
