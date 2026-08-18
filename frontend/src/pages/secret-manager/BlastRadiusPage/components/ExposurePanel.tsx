import { Skeleton } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { ExposureBand, ExposureDriverTone, TBlastRadius } from "@app/hooks/api/blastRadius";

import { EXPOSURE_BAND_LABEL } from "../utils/format";

type Props = {
  blastRadius?: TBlastRadius;
  docsHref: string;
};

// Bands in ascending order, so the meter and the caption are generated from one source rather than two
// lists that can disagree.
const BANDS = [
  { band: ExposureBand.Low, label: "Low", range: "0–29" },
  { band: ExposureBand.Elevated, label: "Elevated", range: "30–59" },
  { band: ExposureBand.High, label: "High", range: "60–84" },
  { band: ExposureBand.Critical, label: "Critical", range: "85–100" }
];

const BAND_TEXT: Record<ExposureBand, string> = {
  [ExposureBand.Low]: "text-success",
  [ExposureBand.Elevated]: "text-info",
  [ExposureBand.High]: "text-warning",
  [ExposureBand.Critical]: "text-danger",
  [ExposureBand.Unavailable]: "text-muted"
};

const BAND_FILL: Record<ExposureBand, string> = {
  [ExposureBand.Low]: "bg-success",
  [ExposureBand.Elevated]: "bg-info",
  [ExposureBand.High]: "bg-warning",
  [ExposureBand.Critical]: "bg-danger",
  [ExposureBand.Unavailable]: "bg-muted"
};

const DRIVER_TONE: Record<ExposureDriverTone, string> = {
  [ExposureDriverTone.Danger]: "text-danger",
  [ExposureDriverTone.Warning]: "text-warning",
  [ExposureDriverTone.Neutral]: "text-accent"
};

/**
 * The score with its arithmetic shown. A bare number invites "why 54?", and the honest answer is a short
 * list of weighted contributions, so the drivers carry the points they contributed rather than being
 * prose that happens to sit near a number.
 */
export const ExposurePanel = ({ blastRadius, docsHref }: Props) => {
  if (!blastRadius) {
    return (
      <div className="flex gap-6 border-y border-border bg-container px-4 py-3">
        <Skeleton className="h-20 w-44" />
        <Skeleton className="h-20 flex-1" />
      </div>
    );
  }

  const { exposure, window } = blastRadius;
  const isScored = exposure.band !== ExposureBand.Unavailable && exposure.score !== null;

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3 border-y border-border bg-container px-4 py-3">
      <div className="flex w-44 shrink-0 flex-col gap-1.5">
        <span className="text-xs tracking-wide text-muted uppercase">Exposure</span>

        <div className="flex items-baseline gap-2">
          <span className={cn("text-4xl leading-none font-semibold", BAND_TEXT[exposure.band])}>
            {isScored ? exposure.score : "—"}
          </span>
          <span className={cn("text-sm", BAND_TEXT[exposure.band])}>
            {EXPOSURE_BAND_LABEL[exposure.band]}
          </span>
        </div>

        {/* Four segments rather than a continuous bar: the bands are what decide whether anyone acts, so
            the meter should answer "which band" before "how far along". */}
        <div className="flex gap-1" aria-hidden>
          {BANDS.map((entry) => (
            <span
              key={entry.band}
              className={cn(
                "h-1 flex-1 rounded-full",
                isScored && entry.band === exposure.band ? BAND_FILL[exposure.band] : "bg-border"
              )}
            />
          ))}
        </div>

        <p className="text-xs leading-relaxed text-muted">
          {BANDS.map((entry) => `${entry.label} ${entry.range}`).join(" · ")}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 border-border sm:border-l sm:pl-6">
        {exposure.drivers.length ? (
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {exposure.drivers.map((driver) => (
              <div key={driver.label} className="flex gap-2.5">
                {isScored && (
                  // Left-aligned in a fixed column: the labels line up either way, but right-aligning the
                  // numbers leaves `+8` indented against `+12` and the column reads as ragged. The leading
                  // has to match the label's or the mono digits ride above its baseline.
                  <span
                    className={cn(
                      "w-7 shrink-0 font-mono text-xs leading-relaxed",
                      DRIVER_TONE[driver.tone]
                    )}
                  >
                    +{driver.points}
                  </span>
                )}
                <p className="text-xs leading-relaxed text-foreground">{driver.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-accent">
            Nothing is driving this score up: access is narrow, used, and the value is current.
          </p>
        )}

        <p className="text-xs text-muted">
          {isScored
            ? `Recomputed on every open over the ${window.effectiveDays}-day window. `
            : "Read activity is hidden for your role, so the score cannot be computed. "}
          {/* Underlined rather than tinted: it sits inside a muted caption, and colouring it made the one
              link in the header louder than the drivers above it. */}
          <a href={docsHref} target="_blank" rel="noopener noreferrer" className="underline">
            How exposure is scored
          </a>
        </p>
      </div>
    </div>
  );
};
