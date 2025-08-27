import { useState } from "react";
import { faBan, faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ms from "ms";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, EmptyState, IconButton, Spinner, Tooltip } from "@app/components/v2";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/context";
import { useTimedReset } from "@app/hooks";
import {
  useClearIdentityUniversalAuthLockouts,
  useGetIdentityUniversalAuth,
  useGetIdentityUniversalAuthClientSecrets
} from "@app/hooks/api";
import { IdentityUniversalAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityUniversalAuthForm";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { IdentityUniversalAuthClientSecretsTable } from "./IdentityUniversalAuthClientSecretsTable";
import { ViewAuthMethodProps } from "./types";
import { ViewIdentityContentWrapper } from "./ViewIdentityContentWrapper";

export const ViewIdentityUniversalAuthContent = ({
  identityId,
  handlePopUpToggle,
  handlePopUpOpen,
  onDelete,
  popUp,
  lockedOut,
  onResetAllLockouts
}: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityUniversalAuth(identityId);
  const { data: clientSecrets = [], isPending: clientSecretsPending } =
    useGetIdentityUniversalAuthClientSecrets(identityId);
  const { mutateAsync: clearLockoutsFn, isPending: isClearLockoutsPending } =
    useClearIdentityUniversalAuthLockouts();

  const [lockedOutState, setLockedOutState] = useState(lockedOut);

  const [copyTextClientId, isCopyingClientId, setCopyTextClientId] = useTimedReset<string>({
    initialState: "Copy Client ID to clipboard"
  });

  async function clearLockouts() {
    try {
      const deleted = await clearLockoutsFn({ identityId });
      createNotification({
        text: `Successfully cleared ${deleted} lockout${deleted === 1 ? "" : "s"}`,
        type: "success"
      });
      setLockedOutState(false);
      onResetAllLockouts();
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to clear lockouts. Please try again.",
        type: "error"
      });
    }
  }

  if (isPending || clientSecretsPending) {
    return (
      <div className="flex w-full items-center justify-center">
        <Spinner className="text-mineshaft-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={faBan}
        title="Could not find Universal Auth associated with this Identity."
      />
    );
  }

  if (popUp.identityAuthMethod.isOpen) {
    return (
      <IdentityUniversalAuthForm
        identityId={identityId}
        isUpdate
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
    );
  }

  return (
    <ViewIdentityContentWrapper
      onEdit={() => handlePopUpOpen("identityAuthMethod")}
      onDelete={onDelete}
    >
      {Number(data.accessTokenPeriod) > 0 ? (
        <IdentityAuthFieldDisplay label="Access Token Period (seconds)">
          {data.accessTokenPeriod}
        </IdentityAuthFieldDisplay>
      ) : (
        <>
          <IdentityAuthFieldDisplay label="Access Token TTL (seconds)">
            {data.accessTokenTTL}
          </IdentityAuthFieldDisplay>
          <IdentityAuthFieldDisplay label="Access Token Max TTL (seconds)">
            {data.accessTokenMaxTTL}
          </IdentityAuthFieldDisplay>
        </>
      )}
      <IdentityAuthFieldDisplay label="Access Token Max Number of Uses">
        {data.accessTokenNumUsesLimit}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Access Token Trusted IPs">
        {data.accessTokenTrustedIps.map((ip) => ip.ipAddress).join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Client Secret Trusted IPs">
        {data.clientSecretTrustedIps.map((ip) => ip.ipAddress).join(", ")}
      </IdentityAuthFieldDisplay>
      <div className="col-span-2 mt-3 flex justify-between border-b border-mineshaft-500 pb-2">
        <span className="text-bunker-300">Lockout Options</span>
        <OrgPermissionCan I={OrgPermissionIdentityActions.Edit} a={OrgPermissionSubjects.Identity}>
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed || !lockedOutState || isClearLockoutsPending}
              size="xs"
              onClick={() => clearLockouts()}
              isLoading={isClearLockoutsPending}
              colorSchema="secondary"
            >
              Reset All Lockouts
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <IdentityAuthFieldDisplay label="Lockout">
        {data.lockoutEnabled ? "Enabled" : "Disabled"}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Lockout Threshold">
        {data.lockoutThreshold}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Lockout Duration">
        {ms(data.lockoutDurationSeconds * 1000, { long: true })}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Lockout Counter Reset">
        {ms(data.lockoutCounterResetSeconds * 1000, { long: true })}
      </IdentityAuthFieldDisplay>
      <div className="col-span-2 my-3">
        <div className="mb-3 border-b border-mineshaft-500 pb-2">
          <span className="text-bunker-300">Client ID</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">{data.clientId}</span>
          <Tooltip content={copyTextClientId}>
            <IconButton
              ariaLabel="copy icon"
              variant="plain"
              onClick={() => {
                navigator.clipboard.writeText(data.clientId);
                setCopyTextClientId("Copied");
              }}
            >
              <FontAwesomeIcon icon={isCopyingClientId ? faCheck : faCopy} />
            </IconButton>
          </Tooltip>
        </div>
      </div>
      <IdentityUniversalAuthClientSecretsTable
        clientSecrets={clientSecrets}
        identityId={identityId}
      />
    </ViewIdentityContentWrapper>
  );
};
