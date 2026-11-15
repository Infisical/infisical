import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Link } from "@tanstack/react-router";

import { isAgentVaultSessionLogBlockedByPlan } from "@app/helpers/agentVaultSessionLogs";
import { AgentVaultSessionLogStorageType } from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultSessionLogReadAccess } from "@app/hooks/api/agentVault/types";

import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import {
  AwsSetupDialog,
  HostBlockedMessage
} from "../AgentVaultSettingsPage/session-logs/aws-setup-dialog";
import { UpgradeDialog } from "../AgentVaultSettingsPage/session-logs/upgrade-dialog";

const READ_ACCESS_ALERTS: Record<
  Exclude<TAgentVaultSessionLogReadAccess, "readable">,
  { message: (host: string) => React.ReactNode; action?: string }
> = {
  "cors-missing": {
    message: () =>
      "Session logs can't be read back, because the bucket they're stored in isn't allowing requests from this origin.",
    action: "View CORS rule"
  },
  "access-denied": {
    message: () =>
      "Session logs can't be read back, because the AWS connection isn't allowed to read from the bucket they're stored in.",
    action: "View IAM policy"
  },
  "host-blocked": {
    message: (host) => <HostBlockedMessage host={host} />
  }
};

export const SessionLogAlerts = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const settingsAdapter = useV4Adapter("agentVaultSettings");
  const { data: state } = settingsAdapter.useSessionLogSettings(orgId, projectId);
  const { data: health } = settingsAdapter.useSessionLogHealth(orgId, projectId);
  const { data: plan } = settingsAdapter.useSessionLogPlan(orgId);
  const { data: readCheck } = settingsAdapter.useSessionLogReadCheck(orgId, projectId);
  const [upgradeFor, setUpgradeFor] = useState<AgentVaultSessionLogStorageType | null>(null);
  const [isAwsSetupOpen, setIsAwsSetupOpen] = useState(false);

  const settings = state?.settings ?? null;
  const isBlockedByPlan = plan ? isAgentVaultSessionLogBlockedByPlan(settings, plan) : false;
  const external =
    settings?.storage.type === AgentVaultSessionLogStorageType.External ? settings.storage : null;
  const readAlert =
    !health?.connectionError && readCheck && readCheck.status !== "readable"
      ? READ_ACCESS_ALERTS[readCheck.status]
      : null;

  const settingsLink = (
    <Button variant="outline" size="sm" asChild>
      <Link
        to={v4Path("/organizations/$orgId/projects/agent-vault/$projectId/settings")}
        params={{ orgId, projectId }}
        search={{ selectedTab: "tab-session-logs" }}
      >
        Go to settings
      </Link>
    </Button>
  );

  return (
    <>
      {health?.connectionError && settings?.enabled && !isBlockedByPlan && (
        <Alert tone="bad" actions={settingsLink}>
          {health.connectionError}
        </Alert>
      )}
      {isBlockedByPlan && settings && (
        <Alert
          tone="warn"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUpgradeFor(settings.storage.type)}
            >
              Upgrade
            </Button>
          }
        >
          {settings.storage.type === AgentVaultSessionLogStorageType.External
            ? "Your plan no longer includes external storage. Upgrade to see recorded logs and keep recording. Recorded logs stay in your bucket."
            : "Your plan doesn't include default storage, so session logs aren't being recorded. Upgrade to record and view them."}
        </Alert>
      )}
      {settings && !settings.enabled && (
        <Alert tone="warn" actions={settingsLink}>
          Sessions aren&apos;t being logged, so there is no record of what your agents reached.
        </Alert>
      )}
      {readAlert && readCheck && (
        <Alert
          tone="warn"
          actions={
            readAlert.action && (
              <Button variant="outline" size="sm" onClick={() => setIsAwsSetupOpen(true)}>
                {readAlert.action}
              </Button>
            )
          }
        >
          {readAlert.message(readCheck.host ?? "")}
        </Alert>
      )}
      <UpgradeDialog storageType={upgradeFor} onClose={() => setUpgradeFor(null)} />
      <AwsSetupDialog
        open={isAwsSetupOpen}
        onOpenChange={setIsAwsSetupOpen}
        bucket={external?.bucket ?? null}
        keyPrefix={external?.keyPrefix ?? null}
      />
    </>
  );
};
