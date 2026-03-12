import { faBan } from "@fortawesome/free-solid-svg-icons";
import { EyeIcon } from "lucide-react";

import { EmptyState, Spinner, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useGetIdentitySpiffeAuth } from "@app/hooks/api";
import { SpiffeTrustBundleProfile } from "@app/hooks/api/identities/enums";
import { ViewIdentityContentWrapper } from "@app/pages/organization/IdentityDetailsByIDPage/components/ViewIdentityAuth/ViewIdentityContentWrapper";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { ViewAuthMethodProps } from "./types";

const PROFILE_DISPLAY_MAP: Record<string, string> = {
  [SpiffeTrustBundleProfile.STATIC]: "Static",
  [SpiffeTrustBundleProfile.HTTPS_WEB_BUNDLE]: "HTTPS Web Bundle"
};

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
      <EmptyState icon={faBan} title="Could not find SPIFFE Auth associated with this Identity." />
    );
  }

  const { trustBundleDistribution: dist } = data;

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
      <IdentityAuthFieldDisplay label="Trust Bundle Profile">
        {PROFILE_DISPLAY_MAP[dist.profile] || dist.profile}
      </IdentityAuthFieldDisplay>
      {dist.profile === SpiffeTrustBundleProfile.STATIC ? (
        <IdentityAuthFieldDisplay className="col-span-2" label="CA Bundle JWKS">
          {dist.bundle && (
            <Tooltip
              side="right"
              className="max-w-xl p-2"
              content={
                <pre className="rounded-sm bg-mineshaft-600 p-2 break-words whitespace-pre-wrap">
                  {dist.bundle}
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
      ) : (
        <>
          <IdentityAuthFieldDisplay className="col-span-2" label="Bundle Endpoint URL">
            {dist.endpointUrl}
          </IdentityAuthFieldDisplay>
          <IdentityAuthFieldDisplay className="col-span-2" label="Root CA Certificate">
            {dist.caCert && (
              <Tooltip
                side="right"
                className="max-w-xl p-2"
                content={
                  <p className="rounded-sm bg-mineshaft-600 p-2 break-words">{dist.caCert}</p>
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
            {dist.cachedBundleLastRefreshedAt
              ? new Date(dist.cachedBundleLastRefreshedAt).toLocaleString()
              : null}
          </IdentityAuthFieldDisplay>
          <IdentityAuthFieldDisplay label="Bundle Refresh Hint (seconds)">
            {dist.refreshHintSeconds}
          </IdentityAuthFieldDisplay>
        </>
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
