import { ComponentPropsWithoutRef, forwardRef, useMemo, useState } from "react";
import { GlobeIcon, LucideIcon, ServerIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { ProviderIcon } from "@app/components/v3/platform/ProviderIcon";
import { cn } from "@app/components/v3/utils";
import { findAnyTemplateForHostPattern } from "@app/helpers/agentVaultTemplates";
import { AgentVaultServiceType, isNativeServiceType } from "@app/hooks/api/agentVault";

import { NATIVE_SERVICE_META } from "./nativeServiceMeta";

type TServiceIcon = {
  label: string;
  image?: string;
  icon?: LucideIcon;
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
  const template = findAnyTemplateForHostPattern(hostPattern);
  return { label: template?.name ?? labelOf(hostPattern), image: template?.image };
};

// A database or SSH service has no host pattern, so its icon comes from its type.
const iconOf = ({
  hostPattern,
  serviceType
}: {
  hostPattern?: string | null;
  serviceType?: AgentVaultServiceType | null;
}): TServiceIcon => {
  if (isNativeServiceType(serviceType)) {
    const meta = NATIVE_SERVICE_META[serviceType];
    return { label: meta.label, image: meta.image, icon: meta.icon };
  }
  if (hostPattern) return iconFromHostPattern(hostPattern);
  return { label: "Service", icon: ServerIcon };
};

const iconsFromServices = (
  hostPatterns: string[],
  serviceTypes: AgentVaultServiceType[]
): TServiceIcon[] => {
  const byLabel = new Map<string, TServiceIcon>();
  const add = (icon: TServiceIcon) => {
    if (icon.label && !byLabel.has(icon.label)) byLabel.set(icon.label, icon);
  };

  hostPatterns.forEach((pattern) => add(iconFromHostPattern(pattern)));
  serviceTypes.forEach((serviceType) => {
    if (isNativeServiceType(serviceType)) add(iconOf({ serviceType }));
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
    const FallbackIcon = icon.icon ?? GlobeIcon;

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
          <FallbackIcon className="size-3.5" />
        )}
      </div>
    );
  }
);

ServiceChip.displayName = "ServiceChip";

export const ServiceIcon = ({
  hostPattern,
  serviceType,
  className
}: {
  hostPattern?: string | null;
  serviceType?: AgentVaultServiceType | null;
  className?: string;
}) => {
  const icon = useMemo(() => iconOf({ hostPattern, serviceType }), [hostPattern, serviceType]);
  return <ServiceChip icon={icon} className={className} />;
};

// Host patterns collapse to one chip per provider, and database and SSH services to one per type.
type Props = {
  hostPatterns: string[];
  serviceTypes?: AgentVaultServiceType[];
  maxVisible?: number;
  className?: string;
};

const NO_SERVICE_TYPES: AgentVaultServiceType[] = [];

export const ServiceIconStack = ({
  hostPatterns,
  serviceTypes = NO_SERVICE_TYPES,
  maxVisible = 4,
  className
}: Props) => {
  const icons = useMemo(
    () => iconsFromServices(hostPatterns, serviceTypes),
    [hostPatterns, serviceTypes]
  );

  if (icons.length === 0) return <span className="text-muted">&mdash;</span>;

  const visible = icons.slice(0, maxVisible);
  const hidden = icons.slice(maxVisible);

  return (
    // The leftmost chip has to paint on top, and flex-row-reverse cannot do it: reversing the
    // direction moves a chip visually and its paint order follows, so the right edge wins either
    // way. `isolate` confines these depths to the stack, which also traps the chips below a linked
    // row's overlay, so the stack itself is marked interactive for RowLink to lift it. `w-fit` keeps the
    // lifted area to the chips, so the rest of the cell still opens the row.
    <div
      data-row-interactive
      className={cn("isolate flex w-fit items-center -space-x-1.5", className)}
    >
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
            {/* Inside a linked row, RowLink lifts every tooltip trigger to z-10, so the overflow chip
                needs its own depth to stay under the last icon like the rest of the stack. */}
            <div
              aria-hidden
              className={cn(
                chipClassName,
                stackedChipClassName,
                "relative text-[10px] font-medium"
              )}
              style={{ zIndex: 0 }}
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
