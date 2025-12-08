import { faBan } from "@fortawesome/free-solid-svg-icons";
import { EyeIcon } from "lucide-react";

import { EmptyState, Spinner, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useGetIdentityOidcAuth } from "@app/hooks/api";
import { ViewIdentityContentWrapper } from "@app/pages/organization/IdentityDetailsByIDPage/components/ViewIdentityAuth/ViewIdentityContentWrapper";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { ViewAuthMethodProps } from "./types";

export const ViewIdentityOidcAuthContent = ({
  identityId,
  onEdit,
  onDelete
}: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityOidcAuth(identityId);

  if (isPending) {
    return (
      <div className="flex w-full items-center justify-center">
        <Spinner className="text-mineshaft-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState icon={faBan} title="Could not find OIDC Auth associated with this Identity." />
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
      <IdentityAuthFieldDisplay className="col-span-2" label="OIDC Discovery URL">
        {data.oidcDiscoveryUrl}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Issuer">
        {data.boundIssuer}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="CA Certificate">
        {data.caCert && (
          <Tooltip
            side="right"
            className="max-w-xl p-2"
            content={<p className="rounded-sm bg-mineshaft-600 p-2 break-words">{data.caCert}</p>}
          >
            <Badge variant="neutral">
              <EyeIcon />
              Reveal
            </Badge>
          </Tooltip>
        )}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Subject">
        {data.boundSubject}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Audiences">
        {data.boundAudiences
          ?.split(",")
          .map((name) => name.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Claims">
        {Object.keys(data.boundClaims).length && (
          <Tooltip
            side="right"
            className="max-w-xl p-2"
            content={
              <pre className="rounded-sm bg-mineshaft-600 p-2 whitespace-pre-wrap">
                {JSON.stringify(data.boundClaims, null, 2)}
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
      <IdentityAuthFieldDisplay className="col-span-2" label="Claim Metadata Mapping">
        {data.claimMetadataMapping && Object.keys(data.claimMetadataMapping).length && (
          <Tooltip
            side="right"
            className="max-w-xl p-2"
            content={
              <pre className="rounded-sm bg-mineshaft-600 p-2 whitespace-pre-wrap">
                {JSON.stringify(data.claimMetadataMapping, null, 2)}
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
    </ViewIdentityContentWrapper>
  );
};
