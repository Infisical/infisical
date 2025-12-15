import { faBan } from "@fortawesome/free-solid-svg-icons";
import { EyeIcon } from "lucide-react";

import { EmptyState, Spinner, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useGetIdentityJwtAuth } from "@app/hooks/api";
import { IdentityJwtConfigurationType } from "@app/hooks/api/identities/enums";
import { ViewIdentityContentWrapper } from "@app/pages/organization/IdentityDetailsByIDPage/components/ViewIdentityAuth/ViewIdentityContentWrapper";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { ViewAuthMethodProps } from "./types";

export const ViewIdentityJwtAuthContent = ({
  identityId,
  onEdit,
  onDelete
}: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityJwtAuth(identityId);

  if (isPending) {
    return (
      <div className="flex w-full items-center justify-center">
        <Spinner className="text-mineshaft-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState icon={faBan} title="Could not find JWT Auth associated with this Identity." />
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
      <IdentityAuthFieldDisplay label="Configuration Type">
        {data.configurationType === IdentityJwtConfigurationType.JWKS ? "JWKS" : "Static"}
      </IdentityAuthFieldDisplay>
      {data.configurationType === IdentityJwtConfigurationType.JWKS ? (
        <>
          <IdentityAuthFieldDisplay className="col-span-2" label="JWKS URL">
            {data.jwksUrl}
          </IdentityAuthFieldDisplay>
          <IdentityAuthFieldDisplay className="col-span-2" label="JWKS CA Certificate">
            {data.jwksCaCert && (
              <Tooltip
                side="right"
                className="max-w-xl p-2"
                content={
                  <p className="rounded-sm bg-mineshaft-600 p-2 break-words">{data.jwksCaCert}</p>
                }
              >
                <Badge variant="neutral">
                  <EyeIcon />
                  Reveal
                </Badge>
              </Tooltip>
            )}
          </IdentityAuthFieldDisplay>
        </>
      ) : (
        <IdentityAuthFieldDisplay className="col-span-2" label="Public Keys">
          {data.publicKeys.length && (
            <div className="flex flex-wrap gap-1">
              {data.publicKeys.map((key, index) => (
                <Tooltip
                  side="right"
                  className="max-w-xl p-2"
                  key={key}
                  content={
                    <p className="rounded-sm bg-mineshaft-600 p-2 break-words whitespace-normal">
                      {key}
                    </p>
                  }
                >
                  <Badge variant="neutral">
                    <EyeIcon />
                    Key {index + 1}
                  </Badge>
                </Tooltip>
              ))}
            </div>
          )}
        </IdentityAuthFieldDisplay>
      )}
      <IdentityAuthFieldDisplay className="col-span-2" label="Issuer">
        {data.boundIssuer}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Subject">
        {data.boundSubject}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Audiences">
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
    </ViewIdentityContentWrapper>
  );
};
