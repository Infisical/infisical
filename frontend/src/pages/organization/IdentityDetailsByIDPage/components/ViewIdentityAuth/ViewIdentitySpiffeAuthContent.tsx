import { faBan } from "@fortawesome/free-solid-svg-icons";
import { EyeIcon } from "lucide-react";

import { EmptyState, Spinner, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useGetIdentitySpiffeAuth } from "@app/hooks/api";
import { IdentitySpiffeConfigurationType } from "@app/hooks/api/identities/enums";
import { ViewIdentityContentWrapper } from "@app/pages/organization/IdentityDetailsByIDPage/components/ViewIdentityAuth/ViewIdentityContentWrapper";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { ViewAuthMethodProps } from "./types";

export const ViewIdentitySpiffeAuthContent = ({
  identityId,
  onEdit,
  onDelete
}: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentitySpiffeAuth(identityId);

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
        title="Could not find SPIFFE Auth associated with this Identity."
      />
    );
  }

  const isRemote = data.configurationType === IdentitySpiffeConfigurationType.REMOTE;

  return (
    <ViewIdentityContentWrapper onEdit={onEdit} onDelete={onDelete} identityId={identityId}>
      <IdentityAuthFieldDisplay className="col-span-2" label="Trust Domain">
        {data.trustDomain}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed SPIFFE IDs">
        {data.allowedSpiffeIds
          ?.split(",")
          .map((id) => id.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Audiences">
        {data.allowedAudiences
          ?.split(",")
          .map((aud) => aud.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Configuration Type">
        {isRemote ? "Remote" : "Static"}
      </IdentityAuthFieldDisplay>
      {isRemote ? (
        <>
          <IdentityAuthFieldDisplay className="col-span-2" label="Bundle Endpoint URL">
            {data.bundleEndpointUrl}
          </IdentityAuthFieldDisplay>
          <IdentityAuthFieldDisplay label="Bundle Endpoint Profile">
            {data.bundleEndpointProfile}
          </IdentityAuthFieldDisplay>
          <IdentityAuthFieldDisplay className="col-span-2" label="Bundle Endpoint CA Certificate">
            {data.bundleEndpointCaCert && (
              <Tooltip
                side="right"
                className="max-w-xl p-2"
                content={
                  <p className="rounded-sm bg-mineshaft-600 p-2 break-words">
                    {data.bundleEndpointCaCert}
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
          <IdentityAuthFieldDisplay label="Last Refreshed">
            {data.cachedBundleLastRefreshedAt
              ? new Date(data.cachedBundleLastRefreshedAt).toLocaleString()
              : null}
          </IdentityAuthFieldDisplay>
          <IdentityAuthFieldDisplay label="Bundle Refresh Hint (seconds)">
            {data.bundleRefreshHintSeconds}
          </IdentityAuthFieldDisplay>
        </>
      ) : (
        <IdentityAuthFieldDisplay className="col-span-2" label="CA Bundle JWKS">
          {data.caBundleJwks && (
            <Tooltip
              side="right"
              className="max-w-xl p-2"
              content={
                <pre className="rounded-sm bg-mineshaft-600 p-2 whitespace-pre-wrap break-words">
                  {data.caBundleJwks}
                </pre>
              }
            >
              <Badge variant="neutral">
                <EyeIcon />
                Reveal
              </Badge>
            </Tooltip>
          )}
        </IdentityAuthFieldDisplay>
      )}
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
    </ViewIdentityContentWrapper>
  );
};
