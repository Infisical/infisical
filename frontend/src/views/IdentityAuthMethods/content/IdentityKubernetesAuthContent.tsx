import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { gatewaysQueryKeys, useGetIdentityKubernetesAuth } from "@app/hooks/api";

import { IdentityAuthAccessTokenFields, IdentityAuthFieldDisplay } from "../helpers";
import { ViewAuthMethodProps } from "../types";

export const IdentityKubernetesAuthContent = ({ identityId }: ViewAuthMethodProps) => {
  const { data: gateways } = useQuery(gatewaysQueryKeys.list());

  const { data, isPending } = useGetIdentityKubernetesAuth(identityId);

  const selectedGateway = useMemo(() => {
    return gateways?.find((gateway) => gateway.id === data?.gatewayId) || null;
  }, [gateways, data?.gatewayId]);

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
          <EmptyTitle>Could not find Kubernetes Auth associated with this Identity.</EmptyTitle>
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
      <IdentityAuthFieldDisplay
        className="col-span-2"
        label="Kubernetes Host / Base Kubernetes API URL"
      >
        {data.kubernetesHost}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Gateway">{selectedGateway?.name}</IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Token Reviewer JWT">
        {data.tokenReviewerJwt ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="neutral">
                <EyeIcon />
                Reveal
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xl p-2">
              <p className="rounded-sm bg-container p-2 break-words">
                {data.tokenReviewerJwt || "Not provided"}
              </p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <p className="text-base leading-4 text-muted italic">Not set</p>
        )}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Service Account Names">
        {data.allowedNames
          ?.split(",")
          .map((name) => name.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Namespaces">
        {data.allowedNamespaces
          ?.split(",")
          .map((namespace) => namespace.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Audience">
        {data.allowedAudience}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="CA Certificate">
        {data.caCert && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="neutral">
                <EyeIcon />
                Reveal
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xl p-2">
              <p className="rounded-sm bg-container p-2 break-words">{data.caCert}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </IdentityAuthFieldDisplay>
    </DetailGroup>
  );
};
