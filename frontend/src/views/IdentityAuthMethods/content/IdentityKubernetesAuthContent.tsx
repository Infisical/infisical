import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BanIcon, EyeIcon, EyeOffIcon } from "lucide-react";

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
import { useOrgPermission, useSubscription } from "@app/context";
import {
  OrgPermissionMachineIdentityAuthTemplateActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { gatewaysQueryKeys, useGetIdentityKubernetesAuth } from "@app/hooks/api";
import { gatewayPoolsQueryKeys } from "@app/hooks/api/gateway-pools/queries";
import { IdentityKubernetesAuthTokenReviewMode } from "@app/hooks/api/identities/types";
import { MachineIdentityAuthMethod } from "@app/hooks/api/identityAuthTemplates";
import { useGetAvailableTemplates } from "@app/hooks/api/identityAuthTemplates/queries";

import { IdentityAuthAccessTokenFields, IdentityAuthFieldDisplay } from "../helpers";
import { ViewAuthMethodProps } from "../types";

export const IdentityKubernetesAuthContent = ({ identityId }: ViewAuthMethodProps) => {
  const { subscription } = useSubscription();
  const { permission } = useOrgPermission();

  const canAttachTemplates = permission.can(
    OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
    OrgPermissionSubjects.MachineIdentityAuthTemplate
  );

  const { data: gateways } = useQuery(gatewaysQueryKeys.list());
  const { data: pools } = useQuery({
    ...gatewayPoolsQueryKeys.list(),
    enabled: Boolean(subscription?.gatewayPool)
  });

  const { data, isPending } = useGetIdentityKubernetesAuth(identityId);

  const { data: templates } = useGetAvailableTemplates(MachineIdentityAuthMethod.KUBERNETES, {
    enabled:
      canAttachTemplates &&
      Boolean(subscription?.machineIdentityAuthTemplates) &&
      Boolean(data?.templateId)
  });

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

  const linkedTemplateName = templates?.find((template) => template.id === data.templateId)?.name;
  const configurationLabel = data.templateId
    ? (linkedTemplateName ?? "Linked template")
    : "Custom Configuration";

  const reviewModeLabel =
    data.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Gateway
      ? "Gateway as Reviewer"
      : "Manual Token Reviewer JWT (API)";

  let gatewayDisplay: string | null = null;
  if (data.gatewayPoolId) {
    gatewayDisplay =
      pools?.find((pool) => pool.id === data.gatewayPoolId)?.name ?? data.gatewayPoolId;
  } else if (data.gatewayId) {
    gatewayDisplay =
      gateways?.find((gateway) => gateway.id === data.gatewayId)?.name ?? data.gatewayId;
  }

  // template-sourced JWTs read back as "" (write-only), so truthiness of the value alone
  // would claim "Not set" for an identity that stores and uses one at login
  let tokenReviewerJwtDisplay: ReactNode = null;
  if (data.isTokenReviewerJwtTemplateSourced) {
    tokenReviewerJwtDisplay = (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="neutral">
            <EyeOffIcon />
            Configured
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-md">
          This JWT was copied from an auth template and is write-only, so it cannot be viewed. Edit
          the auth method to replace or remove it.
        </TooltipContent>
      </Tooltip>
    );
  } else if (data.tokenReviewerJwt) {
    tokenReviewerJwtDisplay = (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="neutral">
            <EyeIcon />
            Reveal
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xl p-2">
          <p className="rounded-sm bg-container p-2 break-words">{data.tokenReviewerJwt}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DetailGroup className="grid grid-cols-2 gap-x-6 gap-y-5">
      <IdentityAuthFieldDisplay className="col-span-2" label="Configuration">
        {configurationLabel}
      </IdentityAuthFieldDisplay>
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
      <IdentityAuthFieldDisplay label="Token Review Mode">
        {reviewModeLabel}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Gateway">{gatewayDisplay}</IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Token Reviewer JWT">
        {tokenReviewerJwtDisplay}
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
