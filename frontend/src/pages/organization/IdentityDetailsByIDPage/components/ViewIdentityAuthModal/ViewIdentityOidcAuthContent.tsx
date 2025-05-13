import { faBan, faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge, EmptyState, Spinner, Tooltip } from "@app/components/v2";
import { useGetIdentityOidcAuth } from "@app/hooks/api";
import { IdentityOidcAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityOidcAuthForm";
import { ViewIdentityContentWrapper } from "@app/pages/organization/IdentityDetailsByIDPage/components/ViewIdentityAuthModal/ViewIdentityContentWrapper";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { ViewAuthMethodProps } from "./types";

export const ViewIdentityOidcAuthContent = ({
  identityId,
  handlePopUpToggle,
  handlePopUpOpen,
  onDelete,
  popUp
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

  if (popUp.identityAuthMethod.isOpen) {
    return (
      <IdentityOidcAuthForm
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
            content={<p className="break-words rounded bg-mineshaft-600 p-2">{data.caCert}</p>}
          >
            <div className="w-min">
              <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300">
                <FontAwesomeIcon icon={faEye} />
                <span>Reveal</span>
              </Badge>
            </div>
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
              <pre className="whitespace-pre-wrap rounded bg-mineshaft-600 p-2">
                {JSON.stringify(data.boundClaims, null, 2)}
              </pre>
            }
          >
            <div className="w-min">
              <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300">
                <FontAwesomeIcon icon={faEye} />
                <span>Reveal</span>
              </Badge>
            </div>
          </Tooltip>
        )}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Claim Metadata Mapping">
        {data.claimMetadataMapping && Object.keys(data.claimMetadataMapping).length && (
          <Tooltip
            side="right"
            className="max-w-xl p-2"
            content={
              <pre className="whitespace-pre-wrap rounded bg-mineshaft-600 p-2">
                {JSON.stringify(data.claimMetadataMapping, null, 2)}
              </pre>
            }
          >
            <div className="w-min">
              <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300">
                <FontAwesomeIcon icon={faEye} />
                <span>Reveal</span>
              </Badge>
            </div>
          </Tooltip>
        )}
      </IdentityAuthFieldDisplay>
    </ViewIdentityContentWrapper>
  );
};
