import { faBan } from "@fortawesome/free-solid-svg-icons";

import { EmptyState, Spinner } from "@app/components/v2";
import { useGetIdentityAzureAuth } from "@app/hooks/api";
import { IdentityAzureAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityAzureAuthForm";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { ViewAuthMethodProps } from "./types";
import { ViewIdentityContentWrapper } from "./ViewIdentityContentWrapper";

export const ViewIdentityAzureAuthContent = ({
  identityId,
  handlePopUpToggle,
  handlePopUpOpen,
  onDelete,
  popUp
}: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityAzureAuth(identityId);

  if (isPending) {
    return (
      <div className="flex w-full items-center justify-center">
        <Spinner className="text-mineshaft-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState icon={faBan} title="Could not find Azure Auth associated with this Identity." />
    );
  }

  if (popUp.identityAuthMethod.isOpen) {
    return (
      <IdentityAzureAuthForm
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
      <IdentityAuthFieldDisplay label="Access Token TLL (seconds)">
        {data.accessTokenTTL}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Access Token Max TLL (seconds)">
        {data.accessTokenMaxTTL}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Access Token Max Number of Uses">
        {data.accessTokenNumUsesLimit}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Access Token Trusted IPs">
        {data.accessTokenTrustedIps.map((ip) => ip.ipAddress).join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Tenant ID">
        {data.tenantId}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Resource / Audience">
        {data.resource}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Service Principal IDs">
        {data.allowedServicePrincipalIds
          ?.split(",")
          .map((id) => id.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
    </ViewIdentityContentWrapper>
  );
};
