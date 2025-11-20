import { faBan } from "@fortawesome/free-solid-svg-icons";

import { EmptyState, Spinner } from "@app/components/v2";
import { useGetIdentityGcpAuth } from "@app/hooks/api";
import { IdentityGcpAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityGcpAuthForm";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { ViewAuthMethodProps } from "./types";
import { ViewIdentityContentWrapper } from "./ViewIdentityContentWrapper";

export const ViewIdentityGcpAuthContent = ({
  identityId,
  handlePopUpToggle,
  handlePopUpOpen,
  onDelete,
  popUp
}: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityGcpAuth(identityId);

  if (isPending) {
    return (
      <div className="flex w-full items-center justify-center">
        <Spinner className="text-mineshaft-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState icon={faBan} title="Could not find GCP Auth associated with this Identity." />
    );
  }

  if (popUp.identityAuthMethod.isOpen) {
    return (
      <IdentityGcpAuthForm
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
      identityId={identityId}
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
      <IdentityAuthFieldDisplay label="Type">
        {data.type === "gce" ? "GCP ID Token Auth" : "GCP IAM Auth"}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Service Account Emails">
        {data.allowedServiceAccounts
          ?.split(",")
          .map((account) => account.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
      {data.type === "gce" && (
        <>
          <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Projects">
            {data.allowedProjects
              ?.split(",")
              .map((project) => project.trim())
              .join(", ")}
          </IdentityAuthFieldDisplay>
          <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Zones">
            {data.allowedZones
              ?.split(",")
              .map((zone) => zone.trim())
              .join(", ")}
          </IdentityAuthFieldDisplay>
        </>
      )}
    </ViewIdentityContentWrapper>
  );
};
