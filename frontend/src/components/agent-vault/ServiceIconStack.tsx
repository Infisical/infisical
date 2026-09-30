import { ComponentPropsWithoutRef, forwardRef, ReactNode, useMemo, useState } from "react";
import { GlobeIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { ProviderIcon } from "@app/components/v3/platform/ProviderIcon";
import { cn } from "@app/components/v3/utils";
import { findTemplateForHostPattern } from "@app/helpers/agentVaultTemplates";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";

type TServiceIcon = {
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

const iconFromHostPattern = (hostPattern: string): TServiceIcon => {
  const template = findTemplateForHostPattern(hostPattern);
  return { label: template?.name ?? labelOf(hostPattern), image: template?.image };
};

const iconsFromHostPatterns = (hostPatterns: string[]): TServiceIcon[] => {
  const byLabel = new Map<string, TServiceIcon>();

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

type TServiceChipProps = ComponentPropsWithoutRef<"div"> & { icon: TServiceIcon };

const ServiceChip = forwardRef<HTMLDivElement, TServiceChipProps>(
  ({ icon, className, ...props }, ref) => {
    const [hasImageError, setHasImageError] = useState(false);

    return (
      <div ref={ref} className={cn(chipClassName, className)} {...props}>
        {icon.image && !hasImageError ? (
          <ProviderIcon
            icon={icon.image}
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

ServiceChip.displayName = "ServiceChip";

export const ServiceIcon = ({
  hostPattern,
  className
}: {
  hostPattern: string;
  className?: string;
}) => {
  const icon = useMemo(() => iconFromHostPattern(hostPattern), [hostPattern]);
  return <ServiceChip icon={icon} className={className} />;
};

// Host patterns collapse to one chip per provider. Services keep a chip each under their own name,
// since two services on one provider are still two services.
type Props = {
  maxVisible?: number;
  emptyPlaceholder?: ReactNode;
  className?: string;
} & (
  | { hostPatterns: string[]; services?: never }
  | { services: Pick<TAgentVaultService, "name" | "hostPattern">[]; hostPatterns?: never }
);

export const ServiceIconStack = ({
  hostPatterns,
  services,
  maxVisible = 4,
  emptyPlaceholder = <span className="text-muted">&mdash;</span>,
  className
}: Props) => {
  const icons = useMemo(
    () =>
      services
        ? services.map((service) => ({
            label: service.name,
            image: findTemplateForHostPattern(service.hostPattern)?.image
          }))
        : iconsFromHostPatterns(hostPatterns),
    [hostPatterns, services]
  );

  if (icons.length === 0) return emptyPlaceholder;

  const visible = icons.slice(0, maxVisible);
  const hidden = icons.slice(maxVisible);

  return (
    // The leftmost chip has to paint on top, and flex-row-reverse cannot do it: reversing the
    // direction moves a chip visually and its paint order follows, so the right edge wins either
    // way. `isolate` confines these depths to the stack.
    <div className={cn("isolate flex items-center -space-x-1.5", className)}>
      {/* A screen reader never opens the hover tooltips, so it reads the names here. First, since the
          spacing puts a negative margin on every child but the last, and the last has to stay a chip. */}
      <span className="sr-only">{icons.map((icon) => icon.label).join(", ")}</span>
      {visible.map((icon, index) => (
        <Tooltip key={icon.label}>
          <TooltipTrigger asChild>
            <ServiceChip
              icon={icon}
              aria-hidden
              className={cn(stackedChipClassName, "relative")}
              style={{ zIndex: visible.length - index }}
            />
          </TooltipTrigger>
          <TooltipContent>{icon.label}</TooltipContent>
        </Tooltip>
      ))}
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              aria-hidden
              className={cn(chipClassName, stackedChipClassName, "text-[10px] font-medium")}
            >
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
