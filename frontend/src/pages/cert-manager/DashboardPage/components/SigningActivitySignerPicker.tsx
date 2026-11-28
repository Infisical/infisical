import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Checkbox,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  getSignerStatusBadgeVariant,
  MAX_SIGNING_ACTIVITY_SIGNERS,
  SignerOrderBy,
  SignerStatus,
  signerStatusLabels,
  useListSigners
} from "@app/hooks/api/signers";
import { useDebounce } from "@app/hooks/useDebounce";

export type SignerOption = { id: string; name: string; status?: SignerStatus };

type Props = {
  projectId: string;
  value: SignerOption[];
  onChange: (signers: SignerOption[]) => void;
  activityCounts: Map<string, number>;
};

const PICKER_PAGE_SIZE = 100;
const CHIP_GAP_PX = 4;
const CHIP_CLASS =
  "flex h-5 max-w-full min-w-0 shrink-0 items-center gap-0.5 rounded-sm bg-foreground/10 px-1 text-xs text-foreground";
const CHIP_LABEL_CLASS = "max-w-32 min-w-0 truncate";
const CHIP_REMOVE_CLASS =
  "flex size-3.5 shrink-0 items-center justify-center rounded-xs text-muted hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export const SigningActivitySignerPicker = ({
  projectId,
  value,
  onChange,
  activityCounts
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const { data, isFetching } = useListSigners({
    projectId,
    limit: PICKER_PAGE_SIZE,
    orderBy: SignerOrderBy.Name,
    orderDirection: OrderByDirection.ASC,
    ...(debouncedSearch ? { search: debouncedSearch } : {})
  });

  const anchorRef = useRef<HTMLDivElement>(null);
  const chipAreaRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [chipAreaWidth, setChipAreaWidth] = useState(0);
  const [visibleCount, setVisibleCount] = useState(value.length);

  useLayoutEffect(() => {
    const chipArea = chipAreaRef.current;
    if (!chipArea) return undefined;
    const observer = new ResizeObserver(([entry]) => setChipAreaWidth(entry.contentRect.width));
    observer.observe(chipArea);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const measured = measureRef.current;
    if (!measured) return;
    const chipWidths = Array.from(measured.querySelectorAll<HTMLElement>("[data-chip]")).map(
      (chip) => chip.offsetWidth
    );
    const overflowWidth = measured.querySelector<HTMLElement>("[data-overflow]")?.offsetWidth ?? 0;

    let usedWidth = 0;
    let fitCount = 0;
    for (let i = 0; i < chipWidths.length; i += 1) {
      const nextWidth = usedWidth + (i ? CHIP_GAP_PX : 0) + chipWidths[i];
      const remaining = chipWidths.length - (i + 1);
      if (nextWidth + (remaining ? CHIP_GAP_PX + overflowWidth : 0) > chipAreaWidth) break;
      usedWidth = nextWidth;
      fitCount = i + 1;
    }
    setVisibleCount(Math.max(fitCount, Math.min(1, value.length)));
  }, [value, chipAreaWidth]);

  const selectedIds = new Set(value.map(({ id }) => id));
  const isSelectionFull = value.length >= MAX_SIGNING_ACTIVITY_SIGNERS;
  const options = (data?.signers ?? [])
    .map(({ id, name, status }) => ({ id, name, status }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const remove = (signerId: string) => onChange(value.filter(({ id }) => id !== signerId));
  const toggle = (option: SignerOption) => {
    if (selectedIds.has(option.id)) {
      remove(option.id);
      return;
    }
    if (!isSelectionFull) onChange([...value, option]);
  };

  const visibleSigners = value.slice(0, visibleCount);
  const hiddenSigners = value.slice(visibleCount);

  const renderChip = (signer: SignerOption) => (
    <span key={signer.id} className={CHIP_CLASS}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={CHIP_LABEL_CLASS}>{signer.name}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{signer.name}</TooltipContent>
      </Tooltip>
      <button
        type="button"
        aria-label={`Remove ${signer.name}`}
        className={CHIP_REMOVE_CLASS}
        onClick={(event) => {
          event.stopPropagation();
          remove(signer.id);
        }}
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );

  let footer: string | null = null;
  if (isSelectionFull) {
    footer = `Up to ${MAX_SIGNING_ACTIVITY_SIGNERS} signers. Remove one to pick another`;
  } else if (data && data.totalCount > PICKER_PAGE_SIZE) {
    footer = `Showing ${PICKER_PAGE_SIZE} of ${data.totalCount}, type to search`;
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setSearch("");
      }}
    >
      <PopoverAnchor asChild>
        {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- mouse shortcut only; the chevron button opens the list from the keyboard */}
        <div
          ref={anchorRef}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button")) return;
            setIsOpen((open) => !open);
          }}
          className="relative flex h-7 w-72 cursor-pointer items-center gap-1 rounded-md border border-border pr-1 pl-1 text-sm hover:border-foreground/20"
        >
          <div
            ref={measureRef}
            aria-hidden
            className="pointer-events-none invisible absolute flex gap-1 whitespace-nowrap"
          >
            {value.map((signer) => (
              <span key={signer.id} data-chip className={CHIP_CLASS}>
                <span className={CHIP_LABEL_CLASS}>{signer.name}</span>
                <span className="size-3.5" />
              </span>
            ))}
            <span data-overflow className={CHIP_CLASS}>
              +{value.length}
            </span>
          </div>
          <div ref={chipAreaRef} className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {visibleSigners.map(renderChip)}
            {hiddenSigners.length > 0 && (
              <HoverCard openDelay={100} closeDelay={150}>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${hiddenSigners.length} more selected signers`}
                    className={twMerge(CHIP_CLASS, "hover:bg-foreground/15")}
                  >
                    +{hiddenSigners.length}
                  </button>
                </HoverCardTrigger>
                <HoverCardContent align="end" className="w-64 p-1">
                  {hiddenSigners.map((signer) => (
                    <div
                      key={signer.id}
                      className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-foreground/5"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="min-w-0 flex-1 truncate">{signer.name}</span>
                        </TooltipTrigger>
                        <TooltipContent side="left">{signer.name}</TooltipContent>
                      </Tooltip>
                      <button
                        type="button"
                        aria-label={`Remove ${signer.name}`}
                        className={CHIP_REMOVE_CLASS}
                        onClick={() => remove(signer.id)}
                      >
                        <XIcon className="size-3" />
                      </button>
                    </div>
                  ))}
                </HoverCardContent>
              </HoverCard>
            )}
            {!value.length && <span className="truncate pl-1 text-muted">All signers</span>}
          </div>
          {value.length > 0 && (
            <button
              type="button"
              aria-label="Show all signers"
              className={CHIP_REMOVE_CLASS}
              onClick={() => onChange([])}
            >
              <XIcon className="size-3" />
            </button>
          )}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            aria-label="Select signers"
            onClick={() => setIsOpen((open) => !open)}
            className="flex shrink-0 items-center rounded-xs text-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronDownIcon className="size-4" />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        className="w-80 overflow-hidden p-0"
        onInteractOutside={(event) => {
          if (anchorRef.current?.contains(event.target as Node)) event.preventDefault();
        }}
      >
        <Command shouldFilter={false} className="min-w-0">
          <CommandInput
            aria-label="Search signers"
            placeholder="Search signers"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {!isFetching && <CommandEmpty>No signers match the search</CommandEmpty>}
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedIds.has(option.id);
                const isDisabled = isSelectionFull && !isSelected;
                return (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    disabled={isDisabled}
                    onSelect={() => toggle(option)}
                    className="min-w-0"
                  >
                    <Checkbox
                      isChecked={isSelected}
                      isDisabled={isDisabled}
                      tabIndex={-1}
                      aria-hidden
                      className="pointer-events-none"
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="min-w-0 truncate">{option.name}</span>
                      </TooltipTrigger>
                      <TooltipContent side="left">{option.name}</TooltipContent>
                    </Tooltip>
                    {option.status && option.status !== SignerStatus.Active && (
                      <Badge variant={getSignerStatusBadgeVariant(option.status)}>
                        {signerStatusLabels[option.status]}
                      </Badge>
                    )}
                    <span className="ml-auto shrink-0 text-xs tabular-nums">
                      {activityCounts.get(option.id) || null}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {footer && (
            <div className="border-t border-border px-3 py-2 text-xs text-muted">{footer}</div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};
