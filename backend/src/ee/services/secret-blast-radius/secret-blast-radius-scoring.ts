import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";

import {
  DestinationKind,
  DestinationStatus,
  ExposureBand,
  ExposureDriverTone,
  RotationVerdict,
  TBlastRadiusConsumer,
  TBlastRadiusDestination,
  TBlastRadiusPrincipal,
  TExposureDriver,
  TRotationSimulation,
  TRotationSimulationItem
} from "./secret-blast-radius-types";

export type TScoringInput = {
  // The full sets, never the drawn page: a score that changed with the canvas would be meaningless.
  principals: TBlastRadiusPrincipal[];
  destinations: TBlastRadiusDestination[];
  consumers: TBlastRadiusConsumer[];
  ghostReaders: TBlastRadiusConsumer[];
  lastValueChangedAt: Date;
  isRotationManaged: boolean;
  rotationIntervalDays: number | null;
  hasApprovalPolicy: boolean;
  approvalPolicyName?: string;
  consumptionAvailable: boolean;
  windowDays: number;
  now: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// Counts grow long-tailed: the difference between 2 and 12 principals matters far more than the
// difference between 40 and 50.
const logScale = (value: number, saturateAt: number) => clamp01(Math.log2(value + 1) / Math.log2(saturateAt + 1));

const daysBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));

const isUnhealthy = (destination: TBlastRadiusDestination) =>
  destination.status === DestinationStatus.Failed ||
  destination.status === DestinationStatus.Stale ||
  destination.autoSync === false;

const pluralize = (count: number, singular: string, plural?: string) =>
  `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;

export const summarizeCounts = (input: TScoringInput) => {
  const entitled = input.principals.length;
  const withReadValue = input.principals.filter((principal) =>
    principal.actions.includes(ProjectPermissionSecretActions.ReadValue)
  ).length;
  const observed = input.principals.filter((principal) => (principal.observed?.readCount ?? 0) > 0).length;
  const unhealthyDestinations = input.destinations.filter(isUnhealthy);
  const crossProjectDestinations = input.destinations.filter((destination) => destination.crossProject);
  const deletedGhosts = input.ghostReaders.filter((ghost) => !ghost.principalExists);

  return {
    entitled,
    withReadValue,
    observed,
    noReads: Math.max(0, entitled - observed),
    unhealthyDestinations,
    crossProjectDestinations,
    deletedGhosts,
    valueAgeDays: daysBetween(input.lastValueChangedAt, input.now)
  };
};

export const calculateExposure = (input: TScoringInput) => {
  if (!input.consumptionAvailable) {
    return {
      score: null,
      band: ExposureBand.Unavailable,
      drivers: [
        {
          label:
            "The score weighs read activity against entitlements, so it cannot be computed without audit log access",
          points: 0,
          tone: ExposureDriverTone.Neutral
        }
      ]
    };
  }

  const counts = summarizeCounts(input);
  const weightedDestinations = input.destinations.reduce(
    (total, destination) => total + (destination.crossProject ? 2 : 1),
    0
  );

  const terms = [
    {
      points: 25 * logScale(counts.withReadValue, 40),
      label: `${pluralize(counts.withReadValue, "principal")} can read the value`,
      tone: ExposureDriverTone.Neutral
    },
    {
      points: 15 * clamp01((input.ghostReaders.length + counts.deletedGhosts.length) / 4),
      label: `${pluralize(input.ghostReaders.length, "ghost reader")} still ${
        input.ghostReaders.length === 1 ? "holds" : "hold"
      } the current value`,
      tone: ExposureDriverTone.Warning
    },
    {
      points: 15 * (counts.entitled ? counts.noReads / counts.entitled : 0),
      label: `${counts.noReads} of ${counts.entitled} entitled principals ${
        counts.noReads === 1 ? "has" : "have"
      } no reads in ${input.windowDays}d`,
      tone: ExposureDriverTone.Warning
    },
    {
      points: 15 * clamp01(weightedDestinations / 8),
      label: `${pluralize(input.destinations.length, "destination")} ${
        input.destinations.length === 1 ? "holds" : "hold"
      } the value`,
      tone: ExposureDriverTone.Neutral
    },
    {
      points: 10 * clamp01(counts.unhealthyDestinations.length / 3),
      label: `${counts.unhealthyDestinations.length} of ${input.destinations.length} destinations ${
        counts.unhealthyDestinations.length === 1 ? "is" : "are"
      } stale, failing, or synced by hand`,
      tone: ExposureDriverTone.Danger
    },
    {
      points: 10 * clamp01(counts.valueAgeDays / 365 + (input.isRotationManaged ? 0 : 0.3)),
      label: input.isRotationManaged
        ? `Last rotated ${counts.valueAgeDays} days ago`
        : `No automatic rotation · last rotated ${counts.valueAgeDays} days ago`,
      tone: ExposureDriverTone.Neutral
    },
    {
      points: 10 * clamp01(counts.crossProjectDestinations.length / 2),
      label: `${pluralize(counts.crossProjectDestinations.length, "destination")} ${
        counts.crossProjectDestinations.length === 1 ? "sits" : "sit"
      } outside this project`,
      tone: ExposureDriverTone.Danger
    }
  ];

  const score = Math.round(terms.reduce((total, term) => total + term.points, 0));

  // Every contributing term is returned, not a top slice: the UI shows the points beside each driver, so a
  // truncated list is a list that visibly does not add up to the score.
  const contributing = [...terms].filter((term) => term.points > 0).sort((a, b) => b.points - a.points);

  // Whole numbers that sum to exactly `score`, by largest remainder. Rounding each term independently is off
  // by a point or two against the total often enough to look like a bug.
  const floors = contributing.map((term) => Math.floor(term.points));
  const points = [...floors];
  let remainder = score - floors.reduce((total, value) => total + value, 0);
  contributing
    .map((term, index) => ({ index, fraction: term.points - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ index }) => {
      if (remainder <= 0) return;
      points[index] += 1;
      remainder -= 1;
    });

  const drivers: TExposureDriver[] = contributing
    .map((term, index) => ({ label: term.label, points: points[index], tone: term.tone }))
    // A term worth a fraction of a point rounds to nothing; dropping it keeps the sum exact and avoids a
    // driver that reads "+0".
    .filter((driver) => driver.points > 0);

  let band = ExposureBand.Low;
  if (score >= 85) band = ExposureBand.Critical;
  else if (score >= 60) band = ExposureBand.High;
  else if (score >= 30) band = ExposureBand.Elevated;

  return { score, band, drivers };
};

export const simulateRotation = (
  input: TScoringInput,
  secret: { key: string; environment: string; secretPath: string }
): TRotationSimulation => {
  const counts = summarizeCounts(input);

  const impacts: TRotationSimulationItem[] = [];
  const reasonsToRotate: TRotationSimulationItem[] = [];
  const worthKnowing: TRotationSimulationItem[] = [];
  const willUpdateAutomatically: TRotationSimulationItem[] = [];

  input.destinations.forEach((destination) => {
    if (destination.status === DestinationStatus.Failed) {
      impacts.push({
        code: "sync-failed",
        message: `The ${destination.label} sync is failing, so the new value never reaches ${destination.target ?? "its target"}.`
      });
      return;
    }

    if (destination.status === DestinationStatus.Stale) {
      impacts.push({
        code: "sync-stale",
        message: `${destination.label} has not synced since ${destination.lastSyncedAt ? new Date(destination.lastSyncedAt).toISOString().slice(0, 10) : "its last successful run"}, so the push is likely to fail.`
      });
      return;
    }

    if (destination.autoSync === false) {
      impacts.push({
        code: "sync-manual",
        message: `Auto-sync is off for ${destination.label}. Someone has to push this value by hand.`
      });
      return;
    }

    if (destination.kind === DestinationKind.Sync) {
      willUpdateAutomatically.push({
        code: "sync-healthy",
        message: `${destination.label}${destination.target ? ` ${destination.target}` : ""} receives the new value on the next sync.`
      });
      return;
    }

    if (destination.kind === DestinationKind.Reference) {
      willUpdateAutomatically.push({
        code: "reference",
        message: `${destination.label} references this secret and resolves to the new value.`
      });
      return;
    }

    if (destination.kind === DestinationKind.Import || destination.kind === DestinationKind.Replication) {
      worthKnowing.push({
        code: "import",
        message: `${destination.label} imports this path, so it changes at the same moment as ${secret.environment}.`
      });
      return;
    }

    if (destination.kind === DestinationKind.FolderGrant) {
      worthKnowing.push({
        code: "folder-grant",
        message: `${destination.label} can reach this folder, so its members see the new value too.`
      });
    }
  });

  if (input.consumptionAvailable) {
    // Only consumers that can still read it are classified here. A ghost reader will never pick up the
    // new value, so listing it under "will update automatically" would contradict the ghost band.
    input.consumers
      .filter((consumer) => consumer.entitledNow)
      .forEach((consumer) => {
        const lastRead = new Date(consumer.lastReadAt);
        if (lastRead < input.lastValueChangedAt) {
          impacts.push({
            code: "consumer-stale",
            message: `${consumer.label} last read this ${daysBetween(lastRead, input.now)} days ago, before the current value. It is caching an old value, or it is dead.`
          });
          return;
        }

        // One read across a whole window reads like a process that fetches once and holds it. Said as a
        // likelihood, because the audit log records reads, not what the client did with them.
        if (consumer.readCount <= 2) {
          worthKnowing.push({
            code: "consumer-infrequent",
            message: `${consumer.label} has read this ${pluralize(consumer.readCount, "time")} in ${input.windowDays}d, so it likely fetches at startup and holds the old value until it restarts.`
          });
          return;
        }

        willUpdateAutomatically.push({
          code: "consumer-active",
          message: `${consumer.label} reads this ${consumer.readCount} times in ${input.windowDays}d and picks up the change on its next fetch.`
        });
      });

    if (input.ghostReaders.length) {
      const named = input.ghostReaders.slice(0, 2).map((ghost) => ghost.label);
      const remaining = input.ghostReaders.length - named.length;
      const names = named.join(" and ") + (remaining ? `, and ${remaining} more` : "");
      reasonsToRotate.push({
        code: "ghost-readers",
        message: `${pluralize(input.ghostReaders.length, "ghost reader")} hold the current value and have no access today: ${names}.`
      });
    }

    if (counts.noReads > 0) {
      worthKnowing.push({
        code: "unused-entitlements",
        message: `${counts.noReads} of ${counts.entitled} entitled principals have no reads in ${input.windowDays}d. Rotation is a good moment to remove them.`
      });
    }
  }

  if (input.isRotationManaged) {
    reasonsToRotate.push({
      code: "managed-rotation",
      message: input.rotationIntervalDays
        ? `Managed by automatic rotation every ${input.rotationIntervalDays} days. The previous credential stays valid until the next rotation.`
        : "Managed by automatic rotation. The previous credential stays valid until the next rotation."
    });
  } else {
    reasonsToRotate.push({
      code: "no-rotation",
      message: `Last rotated ${counts.valueAgeDays} days ago. No automatic rotation is configured.`
    });
  }

  if (counts.crossProjectDestinations.length) {
    reasonsToRotate.push({
      code: "leaves-project",
      message: `The value sits in ${pluralize(input.destinations.length, "destination")}, ${counts.crossProjectDestinations.length} of which are outside this project.`
    });
  }

  // An approval policy does not break a rotation, it adds a reviewer. Keeping it out of the verdict
  // means "not safe to rotate" always means something is actually going to break.
  if (input.hasApprovalPolicy) {
    worthKnowing.push({
      code: "approval-policy",
      message: `Changing this value needs approval under the ${input.approvalPolicyName ?? "secret approval"} policy.`
    });
  }

  let verdict = RotationVerdict.Green;
  if (impacts.length) verdict = RotationVerdict.Red;
  else if (worthKnowing.length) verdict = RotationVerdict.Amber;

  const buildHeadline = () => {
    if (verdict === RotationVerdict.Red) return `Not safe to rotate. ${pluralize(impacts.length, "thing")} will break.`;
    if (verdict === RotationVerdict.Amber)
      return `Safe to rotate. ${pluralize(worthKnowing.length, "thing")} need a follow-up.`;
    return "Safe to rotate. Nothing will break.";
  };
  const headline = buildHeadline();

  const subheadline = input.consumptionAvailable
    ? `Simulated against activity from the last ${input.windowDays} days. Nothing has been changed.`
    : "Simulated against entitlements and destinations only. Read activity is not visible to your role.";

  return {
    secret,
    verdict,
    headline,
    subheadline,
    reasonsToRotate,
    impacts,
    worthKnowing,
    willUpdateAutomatically,
    consumptionAvailable: input.consumptionAvailable
  };
};
