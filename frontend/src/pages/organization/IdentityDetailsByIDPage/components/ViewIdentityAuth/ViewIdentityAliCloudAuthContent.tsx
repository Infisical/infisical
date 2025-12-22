import { faBan } from "@fortawesome/free-solid-svg-icons";

import { EmptyState, Spinner } from "@app/components/v2";
import { useGetIdentityAliCloudAuth } from "@app/hooks/api";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { ViewAuthMethodProps } from "./types";
import { ViewIdentityContentWrapper } from "./ViewIdentityContentWrapper";

export const ViewIdentityAliCloudAuthContent = ({
  identityId,
  onEdit,
  onDelete
}: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityAliCloudAuth(identityId);

  if (isPending) {
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
        title="Could not find Alibaba Cloud Auth associated with this Identity."
      />
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
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed ARNs">
        {data.allowedArns
          ?.split(",")
          .map((u) => u.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
    </ViewIdentityContentWrapper>
  );
};
