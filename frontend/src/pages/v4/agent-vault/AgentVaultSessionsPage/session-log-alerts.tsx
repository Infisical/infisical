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

type TReadAccessAlert = { message: (host: string) => React.ReactNode; action?: string };

const READ_ACCESS_ALERTS: Record<
  Exclude<TAgentVaultSessionLogReadAccess, "readable">,
  TReadAccessAlert
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

const PlanBlockedAlert = ({
  storageType,
  onUpgrade
}: {
  storageType: AgentVaultSessionLogStorageType;
  onUpgrade: () => void;
}) => (
  <Alert
    tone="warn"
    actions={
      <Button variant="outline" size="sm" onClick={onUpgrade}>
        Upgrade
      </Button>
    }
  >
    {storageType === AgentVaultSessionLogStorageType.External
      ? "Your plan no longer includes external storage. Upgrade to see recorded logs and keep recording. Recorded logs stay in your bucket."
      : "Your plan doesn't include default storage, so session logs aren't being recorded. Upgrade to record and view them."}
  </Alert>
);

const ReadAccessAlert = ({
  alert,
  host,
  onOpenSetup
}: {
  alert: TReadAccessAlert;
  host: string;
  onOpenSetup: () => void;
}) => (
  <Alert
    tone="warn"
    actions={
      alert.action && (
        <Button variant="outline" size="sm" onClick={onOpenSetup}>
          {alert.action}
        </Button>
      )
    }
  >
    {alert.message(host)}
  </Alert>
);

const useSessionLogAlertState = (orgId: string, projectId: string) => {
  const settingsAdapter = useV4Adapter("agentVaultSettings");
  const { data: state } = settingsAdapter.useSessionLogSettings(orgId, projectId);
  const { data: health } = settingsAdapter.useSessionLogHealth(orgId, projectId);
  const { data: plan } = settingsAdapter.useSessionLogPlan(orgId);
  const { data: readCheck } = settingsAdapter.useSessionLogReadCheck(orgId, projectId);

  const settings = state?.settings ?? null;
  const isBlockedByPlan = plan ? isAgentVaultSessionLogBlockedByPlan(settings, plan) : false;
  const external =
    settings?.storage.type === AgentVaultSessionLogStorageType.External ? settings.storage : null;
  return {
    connectionError:
      settings?.enabled && !isBlockedByPlan ? (health?.connectionError ?? null) : null,
    blockedStorageType: isBlockedByPlan ? (settings?.storage.type ?? null) : null,
    isLoggingOff: settings?.enabled === false,
    readAlert:
      health?.connectionError || !readCheck || readCheck.status === "readable"
        ? null
        : { alert: READ_ACCESS_ALERTS[readCheck.status], host: readCheck.host ?? "" },
    bucket: external?.bucket ?? null,
    keyPrefix: external?.keyPrefix ?? null
  };
};

export const SessionLogAlerts = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const { connectionError, blockedStorageType, isLoggingOff, readAlert, bucket, keyPrefix } =
    useSessionLogAlertState(orgId, projectId);
  const [upgradeFor, setUpgradeFor] = useState<AgentVaultSessionLogStorageType | null>(null);
  const [isAwsSetupOpen, setIsAwsSetupOpen] = useState(false);

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
      {connectionError && (
        <Alert tone="bad" actions={settingsLink}>
          {connectionError}
        </Alert>
      )}
      {blockedStorageType && (
        <PlanBlockedAlert
          storageType={blockedStorageType}
          onUpgrade={() => setUpgradeFor(blockedStorageType)}
        />
      )}
      {isLoggingOff && (
        <Alert tone="warn" actions={settingsLink}>
          Sessions aren&apos;t being logged, so there is no record of what your agents reached.
        </Alert>
      )}
      {readAlert && (
        <ReadAccessAlert
          alert={readAlert.alert}
          host={readAlert.host}
          onOpenSetup={() => setIsAwsSetupOpen(true)}
        />
      )}
      <UpgradeDialog storageType={upgradeFor} onClose={() => setUpgradeFor(null)} />
      <AwsSetupDialog
        open={isAwsSetupOpen}
        onOpenChange={setIsAwsSetupOpen}
        bucket={bucket}
        keyPrefix={keyPrefix}
      />
    </>
  );
};
