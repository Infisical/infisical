import { Button } from "@app/components/v3";
import { TBlastRadius } from "@app/hooks/api/blastRadius";

type Props = {
  truncated: TBlastRadius["truncated"]["principals"];
  onDrawMore: () => void;
  onOpenTable: () => void;
};

/**
 * A rendering limit is not a cluster. Everything not drawn is still counted in every total above, and
 * saying so is what keeps the graph from reading as complete when it is not.
 */
export const TruncationBanner = ({ truncated, onDrawMore, onOpenTable }: Props) => {
  const notDrawn = truncated.total - truncated.drawn;
  if (notDrawn <= 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border bg-container px-3 py-2">
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-medium text-foreground">
          Showing {truncated.drawn} of {truncated.total} principals
        </p>
        <p className="text-xs text-accent">
          {notDrawn} are not drawn at all: {truncated.notDrawnWithoutReads} with no reads in the
          window, {truncated.notDrawnWithReads} with reads. Nothing is hidden from the numbers, only
          from the canvas.
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="xs" variant="outline" onClick={onDrawMore}>
          Draw More
        </Button>
        <Button size="xs" variant="ghost" onClick={onOpenTable}>
          Open Table Mode
        </Button>
      </div>
    </div>
  );
};
