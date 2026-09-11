import { ComponentPropsWithoutRef, forwardRef, ReactNode, useMemo, useState } from "react";
import { GlobeIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { findTemplateForHostPattern } from "@app/helpers/agentVaultTemplates";

type TConnectionIcon = {
  label: string;
  image?: string;
};

const labelOf = (pattern: string) => {
  const trimmed = pattern.trim();
  // A bracketed IPv6 host is full of colons, so only the one after the bracket separates the port.
  const host = trimmed.startsWith("[")
    ? trimmed.slice(0, trimmed.indexOf("]") + 1)
    : trimmed.split(":")[0];
  return host || trimmed;
};

const iconFromHostPattern = (hostPattern: string): TConnectionIcon => {
  const template = findTemplateForHostPattern(hostPattern);
  return { label: template?.name ?? labelOf(hostPattern), image: template?.image };
};

const iconsFromHostPatterns = (hostPatterns: string[]): TConnectionIcon[] => {
  const byLabel = new Map<string, TConnectionIcon>();

  hostPatterns.forEach((pattern) => {
    const icon = iconFromHostPattern(pattern);
    if (icon.label && !byLabel.has(icon.label)) byLabel.set(icon.label, icon);
  });

  return [...byLabel.values()];
};

const chipClassName =
  "flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-border text-foreground/60";

// The ring paints in the table surface color, following the row hover, so each overlapping chip
// reads as its own layer instead of a dark outline.
const stackedChipClassName =
  "ring-2 ring-container transition-shadow duration-75 [tr:hover_&]:ring-container-hover";

type TConnectionChipProps = ComponentPropsWithoutRef<"div"> & { icon: TConnectionIcon };

const ConnectionChip = forwardRef<HTMLDivElement, TConnectionChipProps>(
  ({ icon, className, ...props }, ref) => {
    const [hasImageError, setHasImageError] = useState(false);

    return (
      <div ref={ref} className={cn(chipClassName, className)} {...props}>
        {icon.image && !hasImageError ? (
          <img
            src={`/images/integrations/${icon.image}`}
            alt=""
            className="size-full object-contain p-1"
            onError={() => setHasImageError(true)}
          />
        ) : (
          <GlobeIcon className="size-3.5" />
        )}
      </div>
    );
  }
);

ConnectionChip.displayName = "ConnectionChip";

export const ConnectionIcon = ({
  hostPattern,
  className
}: {
  hostPattern: string;
  className?: string;
}) => {
  const icon = useMemo(() => iconFromHostPattern(hostPattern), [hostPattern]);
  return <ConnectionChip icon={icon} className={className} />;
};

type Props = {
  hostPatterns: string[];
  maxVisible?: number;
  emptyPlaceholder?: ReactNode;
  className?: string;
};

export const ConnectionIconStack = ({
  hostPatterns,
  maxVisible = 4,
  emptyPlaceholder = <span className="text-muted">&mdash;</span>,
  className
}: Props) => {
  const icons = useMemo(() => iconsFromHostPatterns(hostPatterns), [hostPatterns]);

  if (icons.length === 0) return emptyPlaceholder;

  const visible = icons.slice(0, maxVisible);
  const hidden = icons.slice(maxVisible);

  return (
    <div className={cn("flex items-center -space-x-1.5", className)}>
      {visible.map((icon) => (
        <Tooltip key={icon.label}>
          <TooltipTrigger asChild>
            <ConnectionChip icon={icon} className={stackedChipClassName} />
          </TooltipTrigger>
          <TooltipContent>{icon.label}</TooltipContent>
        </Tooltip>
      ))}
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(chipClassName, stackedChipClassName, "text-[10px] font-medium")}>
              +{hidden.length}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-col">
              {hidden.map((icon) => (
                <span key={icon.label}>{icon.label}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};
