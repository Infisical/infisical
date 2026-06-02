import { BanIcon } from "lucide-react";

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, PageLoader } from "@app/components/v3";
import { useGetIdentityGcpAuth } from "@app/hooks/api";

import { IdentityAuthAccessTokenFields, IdentityAuthFieldDisplay } from "../helpers";
import { ViewAuthMethodProps } from "../types";

export const IdentityGcpAuthContent = ({ identityId }: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityGcpAuth(identityId);

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
          <EmptyTitle>Could not find GCP Auth associated with this Identity.</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <IdentityAuthAccessTokenFields
        accessTokenTTL={data.accessTokenTTL}
        accessTokenMaxTTL={data.accessTokenMaxTTL}
        accessTokenNumUsesLimit={data.accessTokenNumUsesLimit}
        accessTokenTrustedIps={data.accessTokenTrustedIps}
      />
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
    </div>
  );
};
