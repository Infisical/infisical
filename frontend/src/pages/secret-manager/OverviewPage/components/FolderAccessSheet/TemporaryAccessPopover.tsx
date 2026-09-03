import { useState } from "react";
import { ChevronDownIcon, ClockIcon } from "lucide-react";

import { Button, Input, Popover, PopoverContent, PopoverTrigger } from "@app/components/v3";

import { DEFAULT_TEMPORARY_RANGE, TEMPORARY_RANGE_PRESETS } from "./folder-access.const";
import { isValidTemporaryRange } from "./folder-access.utils";

type Props = {
  isTemporary: boolean;
  range: string;
  label: string;
  description: string;
  onApply: (range: string) => void;
  onRemove: () => void;
};

export const TemporaryAccessPopover = ({
  isTemporary,
  range,
  label,
  description,
  onApply,
  onRemove
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draftRange, setDraftRange] = useState(range);

  const isDraftRangeValid = isValidTemporaryRange(draftRange);

  // the draft only leaves the popover through Apply, so an abandoned edit never becomes the range
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraftRange(isTemporary ? range : DEFAULT_TEMPORARY_RANGE);
    setIsOpen(nextOpen);
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="neutral" size="md" className="w-full justify-between">
          <span className="flex items-center gap-2 text-foreground">
            <ClockIcon className="size-3.5" />
            {label}
          </span>
          <ChevronDownIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 space-y-3 p-4"
        onFocusOutside={(e) => e.preventDefault()}
      >
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Temporary access</p>
          <p className="text-xs text-muted">{description}</p>
        </div>
        <Input
          value={draftRange}
          onChange={(e) => setDraftRange(e.target.value)}
          placeholder={DEFAULT_TEMPORARY_RANGE}
        />
        <div className="flex gap-1.5">
          {TEMPORARY_RANGE_PRESETS.map((preset) => (
            <Button key={preset} variant="outline" size="xs" onClick={() => setDraftRange(preset)}>
              {preset}
            </Button>
          ))}
        </div>
        {!isDraftRangeValid && (
          <p className="text-xs text-danger">Enter a duration such as 30m, 4h or 1d.</p>
        )}
        <div className="flex justify-between gap-2">
          {isTemporary ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={() => {
                onRemove();
                setIsOpen(false);
              }}
            >
              Remove expiration
            </Button>
          ) : (
            <span />
          )}
          <Button
            variant="project"
            size="sm"
            isDisabled={!isDraftRangeValid}
            onClick={() => {
              onApply(draftRange);
              setIsOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
