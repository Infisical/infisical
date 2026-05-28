import { BanIcon } from "lucide-react";

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, PageLoader } from "@app/components/v3";
import { useGetIdentityTokenAuth, useGetIdentityTokensTokenAuth } from "@app/hooks/api";

import { IdentityAuthFieldDisplay, IdentityTokenAuthTokensTable } from "../helpers";
import { ViewAuthMethodProps } from "../types";

export const IdentityTokenAuthContent = ({ identityId }: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityTokenAuth(identityId);
  const { data: tokens = [], isPending: tokensPending } = useGetIdentityTokensTokenAuth(identityId);

  if (isPending || tokensPending) {
    return <PageLoader />;
  }

  if (!data) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BanIcon />
          </EmptyMedia>
          <EmptyTitle>Could not find Token Auth associated with this Identity.</EmptyTitle>
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
      <IdentityTokenAuthTokensTable tokens={tokens} identityId={identityId} />
    </div>
  );
};
