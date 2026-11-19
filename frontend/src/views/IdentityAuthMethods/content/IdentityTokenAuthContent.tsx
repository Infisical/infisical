import { BanIcon } from "lucide-react";

import {
  DetailGroup,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  PageLoader
} from "@app/components/v3";
import { useGetIdentityTokenAuth } from "@app/hooks/api";

import { IdentityAuthAccessTokenFields, IdentityTokenAuthTokensTable } from "../helpers";
import { ViewAuthMethodProps } from "../types";

export const IdentityTokenAuthContent = ({ identityId }: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityTokenAuth(identityId);

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
          <EmptyTitle>Could not find Token Auth associated with this Identity.</EmptyTitle>
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
      <IdentityTokenAuthTokensTable identityId={identityId} />
    </DetailGroup>
  );
};
