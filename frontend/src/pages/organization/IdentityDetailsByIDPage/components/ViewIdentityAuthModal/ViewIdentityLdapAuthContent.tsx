import { faBan, faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge, EmptyState, Spinner, Tooltip } from "@app/components/v2";
import { useGetIdentityLdapAuth } from "@app/hooks/api";
import { IdentityLdapAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityLdapAuthForm";
import { ViewIdentityContentWrapper } from "@app/pages/organization/IdentityDetailsByIDPage/components/ViewIdentityAuthModal/ViewIdentityContentWrapper";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { ViewAuthMethodProps } from "./types";

export const ViewIdentityLdapAuthContent = ({
  identityId,
  handlePopUpToggle,
  handlePopUpOpen,
  onDelete,
  popUp
}: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityLdapAuth(identityId);

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

  if (popUp.identityAuthMethod.isOpen) {
    return (
      <IdentityLdapAuthForm
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
      <IdentityAuthFieldDisplay label="LDAP URL">{data.url}</IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Bind DN">{data.bindDN}</IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Bind Pass">
        <Tooltip
          side="right"
          className="max-w-xl p-2"
          content={<p className="break-words rounded bg-mineshaft-600 p-2">{data.bindPass}</p>}
        >
          <div className="w-min">
            <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300">
              <FontAwesomeIcon icon={faEye} />
              <span>Reveal</span>
            </Badge>
          </div>
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
              <p className="break-words rounded bg-mineshaft-600 p-2">{data.ldapCaCertificate}</p>
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
