import { faBan } from "@fortawesome/free-solid-svg-icons";
import { EyeIcon } from "lucide-react";

import { EmptyState, Spinner, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useClearIdentityLdapAuthLockouts, useGetIdentityLdapAuth } from "@app/hooks/api";
import { ViewIdentityContentWrapper } from "@app/pages/organization/IdentityDetailsByIDPage/components/ViewIdentityAuth/ViewIdentityContentWrapper";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { LockoutFields } from "./IdentityAuthLockoutFields";
import { ViewAuthMethodProps } from "./types";

export const ViewIdentityLdapAuthContent = ({
  identityId,
  onDelete,
  onEdit,
  lockedOut,
  onResetAllLockouts
}: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityLdapAuth(identityId);
  const clearLockoutsResult = useClearIdentityLdapAuthLockouts();

  if (isPending) {
    return (
      <div className="flex w-full items-center justify-center">
        <Spinner className="text-mineshaft-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState icon={faBan} title="Could not find LDAP Auth associated with this Identity." />
    );
  }

  return (
    <ViewIdentityContentWrapper onEdit={onEdit} onDelete={onDelete} identityId={identityId}>
      <IdentityAuthFieldDisplay label="Access Token TTL (seconds)">
        {data.accessTokenTTL}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Access Token Max TTL (seconds)">
        {data.accessTokenMaxTTL}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Access Token Max Number of Uses">
        {data.accessTokenNumUsesLimit}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Access Token Trusted IPs">
        {data.accessTokenTrustedIps.map((ip) => ip.ipAddress).join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="LDAP URL">{data.url}</IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Bind DN">{data.bindDN}</IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Bind Pass">
        <Tooltip
          side="right"
          className="max-w-xl p-2"
          content={<p className="rounded-sm bg-mineshaft-600 p-2 break-words">{data.bindPass}</p>}
        >
          <Badge variant="neutral">
            <EyeIcon />
            Reveal
          </Badge>
        </Tooltip>
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Search Base / DN">
        {data.searchBase}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Search Filter">{data.searchFilter}</IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="CA Certificate">
        {data.ldapCaCertificate && (
          <Tooltip
            side="right"
            className="max-w-xl p-2"
            content={
              <p className="rounded-sm bg-mineshaft-600 p-2 break-words">
                {data.ldapCaCertificate}
              </p>
            }
          >
            <Badge variant="neutral">
              <EyeIcon />
              Reveal
            </Badge>
          </Tooltip>
        )}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Lockout">
        {data.lockoutEnabled ? "Enabled" : "Disabled"}
      </IdentityAuthFieldDisplay>
      {data.lockoutEnabled && (
        <LockoutFields
          identityId={identityId}
          lockedOut={lockedOut}
          clearLockoutsResult={clearLockoutsResult}
          data={data}
          onResetAllLockouts={onResetAllLockouts}
        />
      )}
    </ViewIdentityContentWrapper>
  );
};
