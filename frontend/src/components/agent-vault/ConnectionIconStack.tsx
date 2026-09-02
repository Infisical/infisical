import { useMemo, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { findTemplateForHostPattern } from "@app/helpers/agentVaultTemplates";

type TConnectionIcon = {
  label: string;
  image?: string;
};

const hostOf = (pattern: string) => pattern.split(":")[0];

// One entry per service rather than per host pattern, so a bundle covering api.openai.com and
// api.openai.com:443 reads as one circle.
const iconsFromHostPatterns = (hostPatterns: string[]): TConnectionIcon[] => {
  const byLabel = new Map<string, TConnectionIcon>();

  hostPatterns.forEach((pattern) => {
    const template = findTemplateForHostPattern(pattern);
    const label = template?.name ?? hostOf(pattern);
    if (!byLabel.has(label)) byLabel.set(label, { label, image: template?.image });
  });

  return [...byLabel.values()];
};

const monogramOf = (label: string) =>
  label
    .replace(/[^a-z0-9]/gi, "")
    .charAt(0)
    .toUpperCase();

// A service with no template art still needs to be distinguishable at a glance, so the hue comes
// from the label instead of a palette lookup that would need an entry per service.
const hueOf = (label: string) =>
  Array.from(label).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) % 360, 7);

const ConnectionCircle = ({ icon }: { icon: TConnectionIcon }) => {
  const [hasImageError, setHasImageError] = useState(false);

  if (icon.image && !hasImageError) {
    return (
      <img
        src={`/images/integrations/${icon.image}`}
        alt=""
        className="size-3.5"
        onError={() => setHasImageError(true)}
      />
    );
  }

  const hue = hueOf(icon.label);

  return (
    <span
      className="flex size-full items-center justify-center text-[10px] font-semibold"
      style={{
        backgroundColor: `hsl(${hue} 38% 24%)`,
        color: `hsl(${hue} 70% 80%)`
      }}
    >
      {monogramOf(icon.label) || "?"}
    </span>
  );
};

type Props = {
  hostPatterns: string[];
  /** Circles drawn before the rest collapse into a "+N" one. */
  maxVisible?: number;
  className?: string;
};

export const ConnectionIconStack = ({ hostPatterns, maxVisible = 4, className }: Props) => {
  const icons = useMemo(() => iconsFromHostPatterns(hostPatterns), [hostPatterns]);

  if (icons.length === 0) return <span className="text-muted">&mdash;</span>;

  const visible = icons.slice(0, maxVisible);
  const hidden = icons.slice(maxVisible);

  return (
    <div className={cn("flex items-center", className)}>
      {visible.map((icon, index) => (
        <Tooltip key={icon.label}>
          <TooltipTrigger asChild>
            <div
              // Earlier circles sit on top, so the stack reads left to right.
              style={{ zIndex: visible.length - index }}
              className={cn(
                "relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-container",
                index > 0 && "-ml-1.5"
              )}
            >
              <ConnectionCircle icon={icon} />
            </div>
          </TooltipTrigger>
          <TooltipContent>{icon.label}</TooltipContent>
        </Tooltip>
      ))}
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative -ml-1.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-container text-[10px] font-semibold text-accent">
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
