import { BanIcon } from "lucide-react";

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, PageLoader } from "@app/components/v3";
import { useGetIdentityAliCloudAuth } from "@app/hooks/api";

import { IdentityAuthFieldDisplay } from "../helpers";
import { ViewAuthMethodProps } from "../types";

export const IdentityAliCloudAuthContent = ({ identityId }: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityAliCloudAuth(identityId);

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
          <EmptyTitle>Could not find Alibaba Cloud Auth associated with this Identity.</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
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
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed ARNs">
        {data.allowedArns
          ?.split(",")
          .map((u) => u.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
    </div>
  );
};
