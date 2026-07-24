import { BanIcon, EyeIcon } from "lucide-react";

import {
  Badge,
  DetailGroup,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  PageLoader,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { IdentityAuthMethod, useGetIdentityLdapAuth } from "@app/hooks/api";

import {
  IdentityAuthAccessTokenFields,
  IdentityAuthFieldDisplay,
  IdentityAuthLockoutFields
} from "../helpers";
import { ViewAuthMethodProps } from "../types";

export const IdentityLdapAuthContent = ({
  identityId,
  isLockedOut,
  onMutated
}: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityLdapAuth(identityId);

  if (isPending) {
    return <PageLoader />;
  }

  if (!data) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BanIcon />
          </EmptyMedia>
          <EmptyTitle>Could not find LDAP Auth associated with this Identity.</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <DetailGroup className="grid grid-cols-2 gap-x-6 gap-y-5">
      <IdentityAuthAccessTokenFields
        accessTokenTTL={data.accessTokenTTL}
        accessTokenMaxTTL={data.accessTokenMaxTTL}
        accessTokenNumUsesLimit={data.accessTokenNumUsesLimit}
        accessTokenTrustedIps={data.accessTokenTrustedIps}
      />
      <IdentityAuthFieldDisplay label="LDAP URL">{data.url}</IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Bind DN">{data.bindDN}</IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Bind Pass">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="neutral">
              <EyeIcon />
              Reveal
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xl p-2">
            <p className="rounded-sm bg-container p-2 break-words">{data.bindPass}</p>
          </TooltipContent>
        </Tooltip>
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Search Base / DN">
        {data.searchBase}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Search Filter">{data.searchFilter}</IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="CA Certificate">
        {data.ldapCaCertificate && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="neutral">
                <EyeIcon />
                Reveal
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xl p-2">
              <p className="rounded-sm bg-container p-2 break-words">{data.ldapCaCertificate}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Lockout">
        {data.lockoutEnabled ? "Enabled" : "Disabled"}
      </IdentityAuthFieldDisplay>
      {data.lockoutEnabled && (
        <IdentityAuthLockoutFields
          identityId={identityId}
          authMethod={IdentityAuthMethod.LDAP_AUTH}
          isLockedOut={isLockedOut ?? false}
          onResetSuccess={() => onMutated?.()}
          data={data}
        />
      )}
    </DetailGroup>
  );
};
