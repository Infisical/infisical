import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  RotationVerdict,
  TRotationSimulation,
  TRotationSimulationItem
} from "@app/hooks/api/blastRadius";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  simulation?: TRotationSimulation;
  isPending: boolean;
  // Only used for the footer's "rotation creates vN"; the simulation itself is version-agnostic.
  currentVersion?: number;
};

const VERDICT_BANNER: Record<RotationVerdict, string> = {
  [RotationVerdict.Red]: "border-danger/40 bg-danger/10 text-danger",
  [RotationVerdict.Amber]: "border-warning/40 bg-warning/10 text-warning",
  [RotationVerdict.Green]: "border-success/40 bg-success/10 text-success"
};

const Section = ({
  title,
  items,
  bullet,
  titleTone
}: {
  title: string;
  items: TRotationSimulationItem[];
  bullet: string;
  titleTone?: string;
}) => {
  if (!items.length) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
      <span className={cn("text-xs tracking-wide uppercase", titleTone ?? "text-accent")}>
        {title} · {items.length}
      </span>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={`${item.code}-${item.message}`} className="flex gap-2.5">
            <span className={cn("mt-1 size-2 shrink-0 rounded-[1px]", bullet)} />
            <p className="text-xs leading-relaxed text-foreground">{item.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * Both halves of the answer are shown at once, and in this order: the reasons to rotate come before the
 * things that break. A reader who only sees the blocking list will correctly conclude "do nothing", which
 * is the wrong call when the value is also years old and known to people who left.
 */
export const RotationSimulationModal = ({
  isOpen,
  onOpenChange,
  simulation,
  isPending,
  currentVersion
}: Props) => {
  const isEmpty =
    simulation &&
    !simulation.reasonsToRotate.length &&
    !simulation.impacts.length &&
    !simulation.worthKnowing.length &&
    !simulation.willUpdateAutomatically.length;

  // Only claimable when a ghost reader is actually one of the reasons; otherwise "overdue" is about age or
  // missing automation, and nobody holds the value who should not.
  const hasGhostReason = simulation?.reasonsToRotate.some((item) => item.code === "ghost-readers");
  const blockingCount = simulation?.impacts.length ?? 0;

  let footerNote: string | undefined;
  if (blockingCount) {
    footerNote = `Fix the ${blockingCount} blocking ${blockingCount === 1 ? "item" : "items"} to enable rotation.`;
  } else if (currentVersion) {
    footerNote = `Rotation creates v${currentVersion + 1}.`;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="flex-row items-baseline justify-between gap-3 px-4 py-3 pr-12">
          <DialogTitle>Simulate Rotation</DialogTitle>
          {simulation && (
            <span className="truncate font-mono text-xs text-muted">
              {simulation.secret.key} · dry run
            </span>
          )}
        </DialogHeader>

        <DialogBody className="flex flex-col p-0">
          {isPending || !simulation ? (
            <div className="flex flex-col gap-3 p-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2.5 px-4 pb-3">
                <div
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-sm font-medium",
                    VERDICT_BANNER[simulation.verdict]
                  )}
                >
                  {simulation.headline}
                </div>
                <p className="text-xs leading-relaxed text-accent">{simulation.subheadline}</p>
              </div>

              <Section
                title="Why it is overdue anyway"
                items={simulation.reasonsToRotate}
                bullet="bg-warning"
                titleTone="text-warning"
              />

              {Boolean(simulation.reasonsToRotate.length && blockingCount) && (
                <p className="px-4 pb-3 text-xs leading-relaxed text-muted">
                  Both sides are true at once: rotating breaks{" "}
                  {blockingCount === 1 ? "one thing" : `${blockingCount} things`}, and not rotating
                  leaves the value{" "}
                  {hasGhostReason ? "with people who no longer have access" : "as it is"}.
                </p>
              )}

              <Section title="Will break" items={simulation.impacts} bullet="bg-danger" />
              <Section title="Worth knowing" items={simulation.worthKnowing} bullet="bg-warning" />

              {isEmpty && (
                <p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-accent">
                  No blocking items and nothing that needs a follow-up.
                </p>
              )}

              {Boolean(simulation.willUpdateAutomatically.length) && (
                <div className="px-4 py-3">
                  {/* The reassuring half gets a card rather than a bulleted list: nothing here is an
                      action, so it should not read like one. */}
                  <div className="flex flex-col gap-2 rounded-md border border-success/30 bg-success/5 p-3">
                    <span className="text-xs tracking-wide text-success uppercase">
                      Will update automatically · {simulation.willUpdateAutomatically.length}
                    </span>
                    {simulation.willUpdateAutomatically.map((item) => (
                      <p
                        key={`${item.code}-${item.message}`}
                        className="text-xs leading-relaxed text-foreground"
                      >
                        {item.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {!simulation.consumptionAvailable && (
                <p className="border-t border-border px-4 py-3 text-xs text-muted">
                  Read activity is hidden for your role, so consumer impact is not included.
                </p>
              )}
            </>
          )}
        </DialogBody>

        {/* `mx-0` undoes DialogFooter's `-mx-6`, which assumes the content keeps its default padding.
            This dialog is edge-to-edge so its sections can carry full-width dividers. */}
        <DialogFooter className="mx-0 items-center px-4 py-3">
          {Boolean(simulation && footerNote) && (
            <p className="mr-auto max-w-sm text-xs leading-relaxed text-muted">{footerNote}</p>
          )}
          <Button size="xs" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
