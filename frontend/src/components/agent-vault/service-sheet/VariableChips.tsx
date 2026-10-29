import { HoverCard, HoverCardContent, HoverCardTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { toVariableReference } from "@app/helpers/agentVaultVariables";

export const chipTone = (isKnown: boolean) =>
  isKnown
    ? "bg-foreground/10 text-label"
    : "bg-danger/15 text-danger ring-1 ring-danger/40 ring-inset";

export const VariableChip = ({
  reference,
  isKnown,
  className
}: {
  reference: string;
  isKnown: boolean;
  className?: string;
}) => <span className={cn("rounded-[3px] px-1", chipTone(isKnown), className)}>{reference}</span>;

// Only the first key shows, so a value using several keeps the hint under its field to one line.
export const VariableKeyChips = ({ keys }: { keys: string[] }) => {
  const [firstKey, ...otherKeys] = keys;
  if (!firstKey) return null;

  return (
    <>
      <VariableChip reference={toVariableReference(firstKey)} isKnown className="font-mono" />
      {otherKeys.length > 0 && (
        <HoverCard openDelay={150} closeDelay={100}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              aria-label={`${otherKeys.length} more: ${otherKeys.join(", ")}`}
              className={cn(
                "rounded-[3px] px-1 font-mono outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50",
                chipTone(true)
              )}
            >
              +{otherKeys.length}
            </button>
          </HoverCardTrigger>
          <HoverCardContent
            align="start"
            className="flex w-auto max-w-sm flex-col items-start gap-1"
          >
            {otherKeys.map((key) => (
              <VariableChip
                key={key}
                reference={toVariableReference(key)}
                isKnown
                className="font-mono text-xs break-all"
              />
            ))}
          </HoverCardContent>
        </HoverCard>
      )}
    </>
  );
};
