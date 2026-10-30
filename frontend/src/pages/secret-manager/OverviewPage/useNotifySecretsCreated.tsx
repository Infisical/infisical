import { useCallback } from "react";

import { createNotification, dismissNotification } from "@app/components/notifications";
import { Button } from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";

export type TCreatedSecret = {
  environment: string;
  key: string;
  value?: string;
  tags?: string[];
};

export type TNotifySecretsCreated = (text: string, secrets: TCreatedSecret[]) => void;

export type TCreatedSecretsShare = { value: string; name?: string };

const MAX_SHARED_SECRET_LENGTH = 10_000;

const toEnvLine = (key: string, value: string) =>
  /[\n"'#]|^\s|\s$/.test(value)
    ? `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`
    : `${key}=${value}`;

// Mirrors the API, which trims created values but keeps one trailing newline.
const toSavedValue = (value: string) =>
  value.at(-1) === "\n" ? `${value.trim()}\n` : value.trim();

export const notifySecretsCreatedWithoutShare: TNotifySecretsCreated = (text) => {
  createNotification({ type: "success", text });
};

// Several secrets share as one KEY=value per line, so the recipient gets a pasteable .env block.
export const useNotifySecretsCreated = (
  secretPath: string,
  onShare: (share: TCreatedSecretsShare) => void
): TNotifySecretsCreated => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();

  return useCallback(
    (text, secrets) => {
      const shareable = new Map<string, string>();
      if (currentProject.secretSharing) {
        secrets.forEach(({ environment, key, value, tags }) => {
          const savedValue = toSavedValue(value ?? "");
          if (!savedValue || shareable.has(key)) return;
          const canReadValue = hasSecretReadValueOrDescribePermission(
            permission,
            ProjectPermissionSecretActions.ReadValue,
            { environment, secretPath, secretName: key, secretTags: tags ?? [] }
          );
          if (canReadValue) shareable.set(key, savedValue);
        });
      }

      const entries = [...shareable.entries()];
      const share: TCreatedSecretsShare =
        entries.length === 1
          ? { name: entries[0][0], value: entries[0][1] }
          : { value: entries.map(([key, value]) => toEnvLine(key, value)).join("\n") };
      const sharedLength = share.name
        ? share.name.length + 1 + share.value.length
        : share.value.length;

      if (!entries.length || sharedLength > MAX_SHARED_SECRET_LENGTH) {
        createNotification({ type: "success", text });
        return;
      }

      const notificationId = createNotification(
        {
          type: "success",
          text,
          callToAction: (
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                dismissNotification(notificationId);
                onShare(share);
              }}
            >
              {entries.length === 1 ? "Share Secret" : `Share ${entries.length} Secrets`}
            </Button>
          )
        },
        { duration: 8000 }
      );
    },
    [currentProject.secretSharing, permission, secretPath, onShare]
  );
};
