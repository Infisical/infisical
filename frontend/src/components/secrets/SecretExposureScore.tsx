import { Badge, Skeleton } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  SecretExposureBand,
  SecretExposureDriver,
  TSecretExposure
} from "@app/hooks/api/secretInsights/types";

export const EXPOSURE_BAND_LABEL: Record<SecretExposureBand, string> = {
  [SecretExposureBand.Low]: "Low",
  [SecretExposureBand.Elevated]: "Elevated",
  [SecretExposureBand.High]: "High",
  [SecretExposureBand.Critical]: "Critical"
};

export const EXPOSURE_BAND_VARIANT: Record<
  SecretExposureBand,
  "success" | "info" | "warning" | "danger"
> = {
  [SecretExposureBand.Low]: "success",
  [SecretExposureBand.Elevated]: "info",
  [SecretExposureBand.High]: "warning",
  [SecretExposureBand.Critical]: "danger"
};

export const EXPOSURE_BAND_TEXT: Record<SecretExposureBand, string> = {
  [SecretExposureBand.Low]: "text-success",
  [SecretExposureBand.Elevated]: "text-info",
  [SecretExposureBand.High]: "text-warning",
  [SecretExposureBand.Critical]: "text-danger"
};

const EXPOSURE_BAND_FILL: Record<SecretExposureBand, string> = {
  [SecretExposureBand.Low]: "bg-success",
  [SecretExposureBand.Elevated]: "bg-info",
  [SecretExposureBand.High]: "bg-warning",
  [SecretExposureBand.Critical]: "bg-danger"
};

const DRIVER_TONE: Record<SecretExposureDriver, string> = {
  [SecretExposureDriver.Readers]: "text-accent",
  [SecretExposureDriver.GhostReaders]: "text-warning",
  [SecretExposureDriver.UnusedAccess]: "text-warning"
};

// Ascending, so the meter, the caption and the card's summary come from one list.
export const EXPOSURE_BANDS = [
  { band: SecretExposureBand.Low, range: "0-29" },
  { band: SecretExposureBand.Elevated, range: "30-59" },
  { band: SecretExposureBand.High, range: "60-84" },
  { band: SecretExposureBand.Critical, range: "85-100" }
];

export const SecretExposureBadge = ({ exposure }: { exposure: TSecretExposure }) => (
  <Badge variant={EXPOSURE_BAND_VARIANT[exposure.band]} className="gap-1.5">
    <span className="font-mono">{exposure.score}</span>
    <span>{EXPOSURE_BAND_LABEL[exposure.band]}</span>
  </Badge>
);

type PanelProps = {
  exposure?: TSecretExposure;
  className?: string;
};

// The score with its arithmetic beside it: each driver carries the whole points it contributed, and they
// add up to the number shown.
export const SecretExposurePanel = ({ exposure, className }: PanelProps) => {
  if (!exposure) {
    return (
      <div className={cn("flex gap-6 rounded-md border border-border bg-container p-4", className)}>
        <Skeleton className="h-20 w-44" />
        <Skeleton className="h-20 flex-1" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap gap-x-6 gap-y-3 rounded-md border border-border bg-container p-4",
        className
      )}
    >
      <div className="flex w-44 shrink-0 flex-col gap-1.5">
        <span className="text-xs tracking-wide text-muted uppercase">Exposure</span>
        <div className="flex items-baseline gap-2">
          <span
            className={cn("text-4xl leading-none font-semibold", EXPOSURE_BAND_TEXT[exposure.band])}
          >
            {exposure.score}
          </span>
          <span className={cn("text-sm", EXPOSURE_BAND_TEXT[exposure.band])}>
            {EXPOSURE_BAND_LABEL[exposure.band]}
          </span>
        </div>
        {/* Four segments rather than a continuous bar: the band is what decides whether anyone acts. */}
        <div className="flex gap-1" aria-hidden>
          {EXPOSURE_BANDS.map((entry) => (
            <span
              key={entry.band}
              className={cn(
                "h-1 flex-1 rounded-full",
                entry.band === exposure.band ? EXPOSURE_BAND_FILL[exposure.band] : "bg-border"
              )}
            />
          ))}
        </div>
        <p className="text-xs leading-relaxed text-muted">
          {EXPOSURE_BANDS.map((entry) => `${EXPOSURE_BAND_LABEL[entry.band]} ${entry.range}`).join(
            " · "
          )}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 border-border sm:border-l sm:pl-6">
        {exposure.drivers.length ? (
          <div className="flex flex-col gap-1.5">
            {exposure.drivers.map((driver) => (
              <div key={driver.kind} className="flex gap-2.5">
                <span
                  className={cn(
                    "w-7 shrink-0 font-mono text-xs leading-relaxed",
                    DRIVER_TONE[driver.kind]
                  )}
                >
                  +{driver.points}
                </span>
                <p className="text-xs leading-relaxed text-foreground">{driver.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-accent">Nobody can read this secret&apos;s value.</p>
        )}
        <p className="text-xs text-muted">
          Up to 45 points for how many can read the value (project admins aside), 30 for ghost
          readers who still know it, and 25 for the share who have not read it in the tracked
          period, which counts in full once that period is 30 days.
        </p>
      </div>
    </div>
  );
};
