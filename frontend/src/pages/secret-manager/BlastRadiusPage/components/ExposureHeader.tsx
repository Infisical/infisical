import {
  AlertTriangleIcon,
  CheckIcon,
  GaugeIcon,
  GhostIcon,
  RefreshCwIcon,
  UploadCloudIcon,
  UsersIcon
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
  Skeleton
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { DestinationStatus, ExposureBand, TBlastRadius } from "@app/hooks/api/blastRadius";

import { EXPOSURE_BAND_LABEL, EXPOSURE_BAND_VARIANT, relativeTime } from "../utils/format";

type Props = {
  blastRadius?: TBlastRadius;
  isPending: boolean;
  // True while the activity request is still in flight. Until it lands the score is genuinely
  // uncomputable, which is not the same as "your role cannot see it", so the two must not look alike.
  isCheckingActivity: boolean;
  onSimulateRotation: () => void;
};

const ICON_TONE: Record<ExposureBand, string> = {
  [ExposureBand.Low]: "border-success/15 bg-success/10 text-success",
  [ExposureBand.Elevated]: "border-info/15 bg-info/10 text-info",
  [ExposureBand.High]: "border-warning/15 bg-warning/10 text-warning",
  [ExposureBand.Critical]: "border-danger/15 bg-danger/10 text-danger",
  [ExposureBand.Unavailable]: "border-neutral/15 bg-neutral/10 text-neutral"
};

const StatTile = ({
  label,
  value,
  detail,
  icon,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone?: "warning";
}) => (
  <div className="flex min-w-0 flex-col gap-1">
    <span className="flex items-center gap-1.5 text-xs text-accent">
      {icon}
      {label}
    </span>
    <span
      className={cn(
        "text-2xl font-semibold",
        tone === "warning" ? "text-warning" : "text-foreground"
      )}
    >
      {value}
    </span>
    <span className="truncate text-xs text-muted">{detail}</span>
  </div>
);

export const ExposureHeader = ({
  blastRadius,
  isPending,
  isCheckingActivity,
  onSimulateRotation
}: Props) => {
  if (isPending || !blastRadius) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[22rem_1fr]">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    );
  }

  const { exposure, principals, destinations, ghostReaders, secret, truncated, window } =
    blastRadius;

  const observedCount = principals.filter(
    (principal) => (principal.observed?.readCount ?? 0) > 0
  ).length;
  const unhealthy = destinations.filter(
    (destination) =>
      destination.status === DestinationStatus.Failed ||
      destination.status === DestinationStatus.Stale ||
      destination.autoSync === false
  ).length;
  const userCount = principals.filter((principal) => principal.type === "user").length;
  const identityCount = principals.filter((principal) => principal.type === "identity").length;
  const groupCount = principals.filter((principal) => principal.type === "group").length;
  const isUnavailable = exposure.band === ExposureBand.Unavailable;

  const describeGhostReaders = () => {
    if (!window.consumptionAvailable) return "hidden";
    return ghostReaders.length ? "hold the value, no access" : "none";
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[22rem_1fr]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Exposure Score</CardTitle>
          <CardAction>
            <div
              className={cn(
                "flex size-9 items-center justify-center rounded-md border [&>svg]:size-5",
                ICON_TONE[exposure.band]
              )}
            >
              <GaugeIcon />
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pb-4">
          {isCheckingActivity ? (
            <>
              <Skeleton className="h-8 w-24" />
              <Separator />
              <Skeleton className="h-12" />
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "text-2xl font-semibold",
                    isUnavailable ? "text-muted" : "text-foreground"
                  )}
                >
                  {exposure.score ?? "—"}
                </span>
                <Badge variant={EXPOSURE_BAND_VARIANT[exposure.band]}>
                  {exposure.band === ExposureBand.Low ? <CheckIcon /> : <AlertTriangleIcon />}
                  {EXPOSURE_BAND_LABEL[exposure.band]}
                </Badge>
              </div>
              <ul className="flex flex-col gap-1">
                {exposure.drivers.map((driver, index) => (
                  <li key={driver} className="flex gap-2 text-xs leading-snug text-accent">
                    <span className="text-muted tabular-nums">
                      {isUnavailable ? "·" : String(index + 1).padStart(2, "0")}
                    </span>
                    {driver}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex h-full flex-col justify-between gap-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <StatTile
              label="Entitled principals"
              value={truncated.principals.total.toLocaleString()}
              detail={[
                userCount ? `${userCount} ${userCount === 1 ? "user" : "users"}` : null,
                identityCount
                  ? `${identityCount} ${identityCount === 1 ? "identity" : "identities"}`
                  : null,
                groupCount ? `${groupCount} ${groupCount === 1 ? "group" : "groups"}` : null
              ]
                .filter(Boolean)
                .join(" · ")}
              icon={<UsersIcon className="size-3.5 text-accent" />}
            />
            <StatTile
              label="Observed readers"
              value={window.consumptionAvailable ? observedCount.toLocaleString() : "—"}
              detail={
                window.consumptionAvailable
                  ? `last ${window.effectiveDays} days`
                  : "needs audit log access"
              }
              icon={<UsersIcon className="size-3.5 text-accent" />}
            />
            <StatTile
              label="Ghost readers"
              value={window.consumptionAvailable ? ghostReaders.length.toLocaleString() : "—"}
              detail={describeGhostReaders()}
              icon={<GhostIcon className="size-3.5 text-warning" />}
              tone={ghostReaders.length ? "warning" : undefined}
            />
            <StatTile
              label="Destinations"
              value={destinations.length.toLocaleString()}
              detail={unhealthy ? `${unhealthy} need attention` : "all healthy"}
              icon={<UploadCloudIcon className="size-3.5 text-accent" />}
            />
            <StatTile
              label="Value changed"
              value={relativeTime(secret.lastValueChangedAt).replace(" ago", "")}
              detail={secret.isRotationManaged ? "managed rotation" : "no automatic rotation"}
              icon={<RefreshCwIcon className="size-3.5 text-secret-rotation" />}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {window.consumptionAvailable
                ? `Read activity from the last ${window.effectiveDays} days. Retention varies by plan.`
                : "Read activity is not visible to your role, so every edge is drawn dashed."}
            </p>
            <Button size="xs" variant="project" onClick={onSimulateRotation}>
              <RefreshCwIcon />
              Simulate Rotation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
