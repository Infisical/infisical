import { ReactNode, useMemo, useState } from "react";

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
  const host = trimmed.startsWith("[") ? trimmed.slice(0, trimmed.indexOf("]") + 1) : trimmed.split(":")[0];
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

const monogramOf = (label: string) =>
  label
    .replace(/[^a-z0-9]/gi, "")
    .charAt(0)
    .toUpperCase() || "?";

const hueOf = (label: string) =>
  Array.from(label).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) % 360, 7);

const tileClassName =
  "relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-container";

const ConnectionTile = ({ icon, className }: { icon: TConnectionIcon; className?: string }) => {
  const [hasImageError, setHasImageError] = useState(false);
  const hue = hueOf(icon.label);

  return (
    <div className={cn(tileClassName, className)}>
      {icon.image && !hasImageError ? (
        <img
          src={`/images/integrations/${icon.image}`}
          alt=""
          className="size-full object-contain p-0.5"
          onError={() => setHasImageError(true)}
        />
      ) : (
        <span
          className="flex size-full items-center justify-center text-[10px] font-semibold"
          style={{
            backgroundColor: `hsl(${hue} 38% 24%)`,
            color: `hsl(${hue} 70% 80%)`
          }}
        >
          {monogramOf(icon.label)}
        </span>
      )}
    </div>
  );
};

export const ConnectionIcon = ({
  hostPattern,
  className
}: {
  hostPattern: string;
  className?: string;
}) => {
  const icon = useMemo(() => iconFromHostPattern(hostPattern), [hostPattern]);
  return <ConnectionTile icon={icon} className={className} />;
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
    <div className={cn("flex items-center", className)}>
      {visible.map((icon, index) => (
        <Tooltip key={icon.label}>
          <TooltipTrigger asChild>
            <div
              style={{ zIndex: visible.length - index }}
              className={cn("relative", index > 0 && "-ml-1.5")}
            >
              <ConnectionTile icon={icon} />
            </div>
          </TooltipTrigger>
          <TooltipContent>{icon.label}</TooltipContent>
        </Tooltip>
      ))}
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(tileClassName, "-ml-1.5 text-[10px] font-semibold text-accent")}>
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
