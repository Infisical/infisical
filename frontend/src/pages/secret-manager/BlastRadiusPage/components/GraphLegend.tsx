import { Button } from "@app/components/v3";
import { TBlastRadius } from "@app/hooks/api/blastRadius";

type Props = {
  blastRadius: TBlastRadius;
  isCheckingActivity: boolean;
  onDrawMore: () => void;
};

/**
 * Sits outside the canvas's scroll container. Inside it, a graph wider than the drawer dragged the
 * legend off the right edge with it.
 */
export const GraphLegend = ({ blastRadius, isCheckingActivity, onDrawMore }: Props) => {
  const { truncated, window } = blastRadius;
  const notDrawn = truncated.principals.total - truncated.principals.drawn;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border bg-container px-4 py-2 text-xs text-accent">
      <div className="flex items-center gap-2">
        <span className="h-0 w-6 border-t border-foreground/60" />
        observed
      </div>
      <div className="flex items-center gap-2">
        <span className="h-0 w-6 border-t border-dashed border-muted" />
        {window.consumptionAvailable
          ? `no reads in ${window.effectiveDays}d`
          : "activity hidden for your role"}
      </div>
      <div className="flex items-center gap-2">
        <span className="h-0 w-6 border-t border-success" />
        synced
      </div>
      <div className="flex items-center gap-2">
        <span className="h-0 w-6 border-t border-dashed border-danger" />
        failing or manual
      </div>

      {notDrawn > 0 && (
        <div className="flex items-center gap-2">
          {/* These are counted in every total but absent from the canvas. Saying so is what stops the
              graph from reading as complete when it is only as complete as the drawing cap allows. */}
          <span className="text-warning">
            {notDrawn} not drawn ({truncated.principals.notDrawnWithoutReads} with no reads)
          </span>
          <Button size="xs" variant="ghost" onClick={onDrawMore}>
            Draw more
          </Button>
        </div>
      )}

      <p className="ml-auto text-muted">
        window {window.effectiveDays}d{window.boundByRetention ? " (capped by retention)" : ""} ·
        retention varies by plan
        {isCheckingActivity ? " · checking activity" : ""}
      </p>
    </div>
  );
};
