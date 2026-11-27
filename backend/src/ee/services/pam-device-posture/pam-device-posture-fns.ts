import {
  PAM_DEVICE_POSTURE_CHECK_LABELS,
  PAM_DEVICE_POSTURE_PROVIDER_NAMES,
  PamDevicePostureCheck,
  PamDevicePostureProvider
} from "./pam-device-posture-enums";
import {
  TPamDevicePostureCheckResult,
  TPamDevicePosturePolicy,
  TPamRipplingPostureProvider
} from "./pam-device-posture-schemas";

export type TRipplingDeviceFacts = {
  found: boolean;
  serial: string;
  model: string | null;
  platform: string | null;
  osName: string | null;
  osVersion: string | null;
  enrolled: boolean;
  lifecycleState: string | null;
  assignedToRequester: boolean;
  requesterFound: boolean;
  requesterActive: boolean;
  encrypted: boolean | null;
  pendingOsUpdate: boolean;
  lastCheckInAt: string | null;
};

// Facts per connection, or the reason the provider couldn't be read
export type TDevicePostureFacts = Record<string, { facts: TRipplingDeviceFacts } | { error: string }>;

const ACTIVE_LIFECYCLE_STATES = new Set(["ACTIVE", "READY"]);
const INACTIVE_WORKER_STATUSES = new Set(["TERMINATED"]);
const PENDING_OS_UPDATE_ACTION = "UPDATE_OS";
const FINISHED_ACTION_STATES = new Set(["COMPLETED", "FAILED", "CANCELLED", "CANCELED"]);

export const toRipplingDeviceFacts = ({
  serial,
  device,
  worker
}: {
  serial: string;
  device: {
    worker_id: string | null;
    platform: string | null;
    model: string | null;
    os_name: string | null;
    os_version: string | null;
    lifecycle_state: string | null;
    enrollment_status: string | null;
    is_managed: boolean | null;
    is_encrypted: boolean | null;
    last_checkin_at: string | null;
    pending_actions?: { action_type: string; state: string | null }[];
  } | null;
  worker: { id: string; status: string | null } | null;
}): TRipplingDeviceFacts => {
  if (!device) {
    return {
      found: false,
      serial,
      model: null,
      platform: null,
      osName: null,
      osVersion: null,
      enrolled: false,
      lifecycleState: null,
      assignedToRequester: false,
      requesterFound: Boolean(worker),
      requesterActive: false,
      encrypted: null,
      pendingOsUpdate: false,
      lastCheckInAt: null
    };
  }

  return {
    found: true,
    serial,
    model: device.model,
    platform: device.platform?.toLowerCase() ?? null,
    osName: device.os_name,
    osVersion: device.os_version,
    enrolled: device.enrollment_status === "ENROLLED" && device.is_managed !== false,
    lifecycleState: device.lifecycle_state,
    assignedToRequester: Boolean(worker && device.worker_id && device.worker_id === worker.id),
    requesterFound: Boolean(worker),
    requesterActive: Boolean(worker && !INACTIVE_WORKER_STATUSES.has(worker.status ?? "")),
    encrypted: device.is_encrypted,
    pendingOsUpdate: (device.pending_actions ?? []).some(
      (action) =>
        action.action_type === PENDING_OS_UPDATE_ACTION &&
        !FINISHED_ACTION_STATES.has((action.state ?? "").toUpperCase())
    ),
    lastCheckInAt: device.last_checkin_at
  };
};

export const compareVersions = (a: string, b: string) => {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"} ago`;

const formatAgo = (hours: number) => {
  if (hours < 1) return plural(Math.max(1, Math.round(hours * 60)), "minute");
  if (hours < 48) return plural(Math.round(hours), "hour");
  return plural(Math.round(hours / 24), "day");
};

const encryptionName = (platform: string | null) => {
  if (platform === "macos") return "FileVault";
  if (platform === "windows") return "BitLocker";
  return "Disk encryption";
};

const check = (
  provider: PamDevicePostureProvider,
  id: PamDevicePostureCheck,
  passed: boolean,
  detail: string
): TPamDevicePostureCheckResult => ({
  provider: PAM_DEVICE_POSTURE_PROVIDER_NAMES[provider],
  check: id,
  label: PAM_DEVICE_POSTURE_CHECK_LABELS[id],
  passed,
  detail
});

const managedDeviceCheck = (facts: TRipplingDeviceFacts) => {
  const result = (passed: boolean, detail: string) =>
    check(PamDevicePostureProvider.Rippling, PamDevicePostureCheck.ManagedDevice, passed, detail);

  if (!facts.found) return result(false, `Serial ${facts.serial} isn't in Rippling.`);
  if (!facts.enrolled) return result(false, "Rippling doesn't manage this device.");
  if (!facts.requesterFound) {
    return result(false, "Rippling has no worker with your Infisical email, so the device can't be matched to you.");
  }
  if (!facts.assignedToRequester) return result(false, "Enrolled in Rippling, but assigned to a different person.");
  if (!facts.requesterActive) return result(false, "Your Rippling profile isn't active.");
  if (!facts.lifecycleState) return result(false, "Rippling doesn't report this device's state.");
  if (!ACTIVE_LIFECYCLE_STATES.has(facts.lifecycleState)) {
    return result(false, `Rippling shows this device as ${facts.lifecycleState.toLowerCase().replaceAll("_", " ")}.`);
  }
  return result(true, "Enrolled in Rippling and assigned to you.");
};

export const evaluateRipplingChecks = (
  config: TPamRipplingPostureProvider,
  facts: TRipplingDeviceFacts,
  now = new Date()
): TPamDevicePostureCheckResult[] => {
  const managed = managedDeviceCheck(facts);
  if (!managed.passed) return [managed];

  const provider = PamDevicePostureProvider.Rippling;
  const results = [managed];
  const { checks } = config;

  if (checks[PamDevicePostureCheck.DiskEncrypted]) {
    const name = encryptionName(facts.platform);
    let detail = `${name} is off.`;
    if (facts.encrypted) detail = `${name} is on.`;
    else if (facts.encrypted === null) detail = "Rippling doesn't report disk encryption for this device.";
    results.push(check(provider, PamDevicePostureCheck.DiskEncrypted, facts.encrypted === true, detail));
  }

  const minOs = checks[PamDevicePostureCheck.MinimumOsVersion];
  const platformKey = facts.platform === "macos" || facts.platform === "windows" ? facts.platform : null;
  const required = minOs && platformKey ? minOs[platformKey] : undefined;
  if (minOs && !facts.platform) {
    results.push(
      check(
        provider,
        PamDevicePostureCheck.MinimumOsVersion,
        false,
        "Rippling doesn't report this device's platform, so its OS version can't be checked."
      )
    );
  } else if (required) {
    const os = [facts.osName, facts.osVersion].filter(Boolean).join(" ") || "The OS version";
    const passed = Boolean(facts.osVersion) && compareVersions(facts.osVersion as string, required) >= 0;
    results.push(
      check(
        provider,
        PamDevicePostureCheck.MinimumOsVersion,
        passed,
        passed ? `${os} meets the ${required} minimum.` : `${os} is below the ${required} minimum.`
      )
    );
  }

  if (checks[PamDevicePostureCheck.NoPendingOsUpdate]) {
    results.push(
      check(
        provider,
        PamDevicePostureCheck.NoPendingOsUpdate,
        !facts.pendingOsUpdate,
        facts.pendingOsUpdate ? "Rippling has an OS update queued for this device." : "No OS update is queued."
      )
    );
  }

  const checkIn = checks[PamDevicePostureCheck.RecentCheckIn];
  if (checkIn) {
    const lastCheckIn = facts.lastCheckInAt ? new Date(facts.lastCheckInAt) : null;
    const hoursAgo =
      lastCheckIn && !Number.isNaN(lastCheckIn.getTime())
        ? Math.max(0, (now.getTime() - lastCheckIn.getTime()) / 3_600_000)
        : null;
    let detail = "Rippling has no check-in for this device.";
    if (hoursAgo !== null) {
      detail =
        hoursAgo <= checkIn.maxHours
          ? `Last check-in ${formatAgo(hoursAgo)}.`
          : `Last check-in ${formatAgo(hoursAgo)}, more than ${checkIn.maxHours} hours.`;
    }
    results.push(
      check(provider, PamDevicePostureCheck.RecentCheckIn, hoursAgo !== null && hoursAgo <= checkIn.maxHours, detail)
    );
  }

  return results;
};

export const evaluateDevicePosture = (
  policy: TPamDevicePosturePolicy,
  facts: TDevicePostureFacts,
  now = new Date()
): { passed: boolean; checks: TPamDevicePostureCheckResult[]; error: string | null } => {
  const checks: TPamDevicePostureCheckResult[] = [];
  let error: string | null = null;
  if (!policy.providers.length) {
    return {
      passed: false,
      checks,
      error:
        "The device posture policy can't be read. Ask an admin to review the account template's Require Device Posture settings."
    };
  }

  policy.providers.forEach((config) => {
    const entry = facts[config.connectionId];
    if (!entry || "error" in entry) {
      error = error ?? (entry && "error" in entry ? entry.error : "The device wasn't checked with this provider.");
      return;
    }
    if (config.provider === PamDevicePostureProvider.Rippling) {
      checks.push(...evaluateRipplingChecks(config, entry.facts, now));
    }
  });

  return { passed: !error && checks.every((result) => result.passed), checks, error };
};

export const getDevicePostureProviderNames = (policy: TPamDevicePosturePolicy | null | undefined) => [
  ...new Set((policy?.providers ?? []).map((config) => PAM_DEVICE_POSTURE_PROVIDER_NAMES[config.provider]))
];

export const describeDevice = (facts: TDevicePostureFacts, serial: string) => {
  const found = Object.values(facts).find(
    (entry): entry is { facts: TRipplingDeviceFacts } => "facts" in entry && entry.facts.found
  )?.facts;
  return {
    serial,
    model: found?.model ?? null,
    os: found ? [found.osName, found.osVersion].filter(Boolean).join(" ") || null : null
  };
};
