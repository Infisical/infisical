import { faBan } from "@fortawesome/free-solid-svg-icons";

import { EmptyState, Spinner } from "@app/components/v2";
import { useGetIdentityTokenAuth, useGetIdentityTokensTokenAuth } from "@app/hooks/api";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { IdentityTokenAuthTokensTable } from "./IdentityTokenAuthTokensTable";
import { ViewAuthMethodProps } from "./types";
import { ViewIdentityContentWrapper } from "./ViewIdentityContentWrapper";

export const ViewIdentityTokenAuthContent = ({
  identityId,
  onDelete,
  onEdit
}: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityTokenAuth(identityId);
  const { data: tokens = [], isPending: clientSecretsPending } =
    useGetIdentityTokensTokenAuth(identityId);

  if (isPending || clientSecretsPending) {
    return (
      <div className="flex w-full items-center justify-center">
        <Spinner className="text-mineshaft-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState icon={faBan} title="Could not find Token Auth associated with this Identity." />
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
      <IdentityTokenAuthTokensTable tokens={tokens} identityId={identityId} />
    </ViewIdentityContentWrapper>
  );
};
