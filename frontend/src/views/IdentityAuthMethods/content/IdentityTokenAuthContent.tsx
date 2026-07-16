import { BanIcon } from "lucide-react";

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, PageLoader } from "@app/components/v3";
import { useGetIdentityTokenAuth, useGetIdentityTokensTokenAuth } from "@app/hooks/api";

import { IdentityAuthAccessTokenFields, IdentityTokenAuthTokensTable } from "../helpers";
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
      <IdentityAuthAccessTokenFields
        accessTokenTTL={data.accessTokenTTL}
        accessTokenMaxTTL={data.accessTokenMaxTTL}
        accessTokenNumUsesLimit={data.accessTokenNumUsesLimit}
        accessTokenTrustedIps={data.accessTokenTrustedIps}
      />
      <IdentityTokenAuthTokensTable tokens={tokens} identityId={identityId} />
    </div>
  );
};
