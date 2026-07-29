import { BanIcon } from "lucide-react";

import {
  DetailGroup,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  PageLoader
} from "@app/components/v3";
import { useGetIdentityOciAuth } from "@app/hooks/api";

import { IdentityAuthAccessTokenFields, IdentityAuthFieldDisplay } from "../helpers";
import { ViewAuthMethodProps } from "../types";

export const IdentityOciAuthContent = ({ identityId }: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityOciAuth(identityId);

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
          <EmptyTitle>Could not find OCI Auth associated with this Identity.</EmptyTitle>
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
      <IdentityAuthFieldDisplay className="col-span-2" label="Tenancy OCID">
        {data.tenancyOcid}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Usernames">
        {data.allowedUsernames
          ?.split(",")
          .map((u) => u.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
    </DetailGroup>
  );
};
