import type { FieldValues } from "react-hook-form";
import { format, setHours, setMinutes } from "date-fns";
import { z, type ZodTypeAny } from "zod";

import { getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { getRotateAtLocal } from "@app/helpers/secretRotationsV2";
import type { AppConnectionFieldPreset } from "@app/pages/v4/components/app-connection-form";

export const methodLabel = (method: Parameters<typeof getAppConnectionMethodDetails>[0]) =>
  getAppConnectionMethodDetails(method).name;

type RotateAtUtc = { hours: number; minutes: number };

const DEFAULT_ROTATION = { rotationInterval: 30, rotateAtUtc: { hours: 0, minutes: 0 } };

/** The rotation time as the local HH:mm the rotateAt select holds. */
export const rotateAtLocal = (utc: RotateAtUtc) => format(getRotateAtLocal(utc), "HH:mm");

const toRotateAtUtc = (local: string): RotateAtUtc => {
  const [hours, minutes] = local.split(":").map(Number);
  const date = setHours(setMinutes(new Date(), minutes), hours);
  return { hours: date.getUTCHours(), minutes: date.getUTCMinutes() };
};

/** Half-hour steps in local time, plus value when it falls between them. */
export const rotateAtOptions = (value?: string) => {
  const times = Array.from({ length: 48 }, (_, index) =>
    format(setMinutes(setHours(new Date(), Math.floor(index / 2)), (index % 2) * 30), "HH:mm")
  );
  if (value && !times.includes(value)) times.push(value);
  return times.sort().map((time) => ({ value: time, label: time }));
};

/** Main's create defaults: rotation off, every 30 days at 00:00 UTC. */
export const ROTATION_VALUES = {
  isAutoRotationEnabled: false,
  rotation: DEFAULT_ROTATION,
  rotateAt: rotateAtLocal(DEFAULT_ROTATION.rotateAtUtc)
};

const rotationOn = (values: FieldValues) => Boolean(values.isAutoRotationEnabled);

/**
 * Main's CredentialRotationForm. The time is a local HH:mm select at the form root (rotateAt);
 * withRotation turns it into rotation.rotateAtUtc before the app's schema runs.
 */
export const rotationFields = (clientSecretKeyId = false): AppConnectionFieldPreset[] => [
  {
    name: "isAutoRotationEnabled",
    label: "Automatic credential rotation",
    kind: "switch",
    description:
      "Infisical takes over this credential: it rotates it on a schedule and revokes the original."
  },
  ...(clientSecretKeyId
    ? [
        {
          name: "credentials.clientSecretKeyId",
          label: "Client secret key ID",
          mono: true,
          optional: true,
          placeholder: "00000000-0000-0000-0000-000000000000",
          description:
            "Found under Certificates & secrets in the app registration. Infisical needs it to revoke the original secret after rotating it.",
          visible: rotationOn
        } satisfies AppConnectionFieldPreset
      ]
    : []),
  {
    name: "rotation.rotationInterval",
    label: "Rotation interval (days)",
    kind: "number",
    placeholder: "30",
    visible: rotationOn
  },
  {
    name: "rotateAt",
    label: "Rotate at (local time)",
    kind: "select",
    options: rotateAtOptions(ROTATION_VALUES.rotateAt),
    visible: rotationOn
  }
];

/** Wraps an app's schema so the rotation fields above reach it as main's payload. */
export const withRotation = (schema: ZodTypeAny) =>
  z.preprocess((raw) => {
    if (typeof raw !== "object" || raw === null) return raw;
    const { rotateAt, ...values } = raw as Record<string, unknown>;
    const rotation: Record<string, unknown> = { ...DEFAULT_ROTATION, ...(values.rotation ?? {}) };
    if (typeof rotation.rotationInterval === "string")
      rotation.rotationInterval =
        rotation.rotationInterval.trim() === "" ? undefined : Number(rotation.rotationInterval);
    if (!values.isAutoRotationEnabled && !Number.isFinite(rotation.rotationInterval))
      rotation.rotationInterval = DEFAULT_ROTATION.rotationInterval;
    if (typeof rotateAt === "string" && rotateAt) rotation.rotateAtUtc = toRotateAtUtc(rotateAt);
    return { ...values, rotation };
  }, schema);
