import { BanIcon, EyeIcon } from "lucide-react";

import {
  Badge,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  PageLoader,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useGetIdentityTlsCertAuth } from "@app/hooks/api";

import { IdentityAuthAccessTokenFields, IdentityAuthFieldDisplay } from "../helpers";
import { ViewAuthMethodProps } from "../types";

export const IdentityTlsCertAuthContent = ({ identityId }: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityTlsCertAuth(identityId);

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
          <EmptyTitle>
            Could not find TLS Certificate Auth associated with this Identity.
          </EmptyTitle>
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
      <IdentityAuthFieldDisplay className="col-span-2" label="CA Certificate">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="neutral">
              <EyeIcon />
              Reveal
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xl p-2">
            <p className="rounded-sm bg-container p-2 break-words">{data.caCertificate}</p>
          </TooltipContent>
        </Tooltip>
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Common Names">
        {data.allowedCommonNames
          ?.split(",")
          .map((cn) => cn.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Subject Alternative Names">
        {data.allowedSubjectAltNames?.join(", ")}
      </IdentityAuthFieldDisplay>
    </div>
  );
};
