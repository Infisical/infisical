import { CheckIcon } from "lucide-react";

import { ExposureBand, TBlastRadius } from "@app/hooks/api/blastRadius";

type Props = {
  blastRadius: TBlastRadius;
};

/**
 * The common state for a well-managed secret. Without this the graph just looks sparse, which reads as
 * a failed load rather than as the good outcome it is.
 */
export const HealthyStateNote = ({ blastRadius }: Props) => {
  const { exposure, principals, destinations, ghostReaders, window } = blastRadius;

  const isHealthy =
    exposure.band === ExposureBand.Low &&
    !ghostReaders.length &&
    window.consumptionAvailable &&
    principals.every((principal) => (principal.observed?.readCount ?? 0) > 0);

  if (!isHealthy) return null;

  const readerCount = principals.length;
  const destinationSummary = destinations.length
    ? `${destinations.length} ${destinations.length === 1 ? "destination" : "destinations"}, all healthy`
    : "Nothing else touches the value";

  return (
    <div className="flex items-start gap-2 rounded-sm border border-success/25 bg-success/10 px-3 py-2">
      <CheckIcon size={14} className="mt-0.5 shrink-0 text-success" />
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-medium text-foreground">This secret is in good shape</p>
        <p className="text-xs leading-snug text-accent">
          {readerCount} {readerCount === 1 ? "principal" : "principals"} can read it and every one
          of them has read it in the last {window.effectiveDays} days. {destinationSummary}. No
          dashed edges, no ghost readers.
        </p>
      </div>
    </div>
  );
};
