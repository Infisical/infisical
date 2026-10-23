import { z } from "zod";

import { AgentVaultSessionLogStorageType } from "@app/hooks/api/agentVault/enums";
import {
  TAgentVaultSessionLogSettings,
  TAgentVaultSessionLogStorage,
  TAgentVaultSessionLogStorageInput
} from "@app/hooks/api/agentVault/types";

export const S3_BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export type TSessionLogFormValues = {
  enabled: boolean;
  storageType: AgentVaultSessionLogStorageType;
  appConnectionId: string;
  bucket: string;
  region: string;
  keyPrefix: string;
};

export const toStorage = (values: TSessionLogFormValues): TAgentVaultSessionLogStorageInput =>
  values.storageType === AgentVaultSessionLogStorageType.Default
    ? { type: AgentVaultSessionLogStorageType.Default }
    : {
        type: AgentVaultSessionLogStorageType.External,
        appConnectionId: values.appConnectionId,
        bucket: values.bucket.trim(),
        region: values.region,
        keyPrefix: values.keyPrefix.trim()
      };

const isSameStorage = (values: TSessionLogFormValues, saved?: TAgentVaultSessionLogStorage) => {
  if (!saved || saved.type !== values.storageType) return false;
  if (saved.type === AgentVaultSessionLogStorageType.Default) return true;
  return (
    saved.appConnectionId === values.appConnectionId &&
    saved.bucket === values.bucket.trim() &&
    saved.region === values.region &&
    (saved.keyPrefix ?? "") === values.keyPrefix.trim()
  );
};

const getKeyPrefixIssue = (value: string) => {
  if (value.length > 256) return "At most 256 characters";
  if (!/^[A-Za-z0-9!\-_.'()/]*$/.test(value))
    return "Use only letters, numbers and ! - _ . ' ( ) /";
  if (value !== "" && !value.split("/").every(Boolean)) {
    return "Use folder names separated by single slashes, with no slash at the start or end";
  }
  if (value.split("/").some((segment) => segment === "." || segment === "..")) {
    return "Cannot use '.' or '..' as a folder name";
  }
  return null;
};

export const buildSessionLogSchema = (
  saved: TAgentVaultSessionLogSettings | null,
  isExternalUsable: boolean
) =>
  z
    .object({
      enabled: z.boolean(),
      storageType: z.nativeEnum(AgentVaultSessionLogStorageType),
      appConnectionId: z.string(),
      bucket: z.string().trim(),
      region: z.string(),
      keyPrefix: z.string().trim()
    })
    .superRefine((values, ctx) => {
      // Only external storage that's being turned on sends these fields, so they're only checked then.
      if (
        !values.enabled ||
        values.storageType !== AgentVaultSessionLogStorageType.External ||
        !isExternalUsable
      )
        return;

      const savedBucket =
        saved?.storage.type === AgentVaultSessionLogStorageType.External
          ? saved.storage.bucket
          : null;
      if (!values.appConnectionId) {
        ctx.addIssue({
          code: "custom",
          path: ["appConnectionId"],
          message: "Session logs need an AWS connection"
        });
      }
      if (values.bucket.length === 0) {
        ctx.addIssue({ code: "custom", path: ["bucket"], message: "Session logs need a bucket" });
      } else if (!S3_BUCKET_NAME.test(values.bucket)) {
        ctx.addIssue({
          code: "custom",
          path: ["bucket"],
          message:
            "Use 3 to 63 lowercase letters, numbers, dots or hyphens, starting and ending with a letter or number"
        });
      } else if (values.bucket.endsWith("--x-s3") && values.bucket !== savedBucket) {
        ctx.addIssue({
          code: "custom",
          path: ["bucket"],
          message:
            "Session logs need a general purpose S3 bucket. Directory buckets (names ending in --x-s3) aren't supported."
        });
      }

      const keyPrefixIssue = getKeyPrefixIssue(values.keyPrefix);
      if (keyPrefixIssue)
        ctx.addIssue({ code: "custom", path: ["keyPrefix"], message: keyPrefixIssue });
    });

// Saving a storage that isn't on the plan opens the upgrade dialog instead, but only when the save would choose,
// change or turn on that storage: an unchanged save of a lapsed bucket is still allowed. Default storage can be on with
// nothing saved, which the server still treats as turning it on, so it always asks.
export const needsSessionLogUpgrade = (
  values: TSessionLogFormValues,
  saved: TAgentVaultSessionLogSettings | null,
  isOnPlan: (type: AgentVaultSessionLogStorageType) => boolean
) => {
  const isStorageChange = !isSameStorage(values, saved?.storage);
  const isBucketAlreadyOn = Boolean(
    saved?.enabled && saved.storage.type === AgentVaultSessionLogStorageType.External
  );
  return (isStorageChange || !isBucketAlreadyOn) && !isOnPlan(values.storageType);
};
