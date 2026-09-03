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
import { useOrgPermission, useSubscription } from "@app/context";
import {
  OrgPermissionMachineIdentityAuthTemplateActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useGetIdentityOidcAuth } from "@app/hooks/api";
import { MachineIdentityAuthMethod } from "@app/hooks/api/identityAuthTemplates";
import { useGetAvailableTemplates } from "@app/hooks/api/identityAuthTemplates/queries";

import { IdentityAuthAccessTokenFields, IdentityAuthFieldDisplay } from "../helpers";
import { ViewAuthMethodProps } from "../types";

export const IdentityOidcAuthContent = ({ identityId }: ViewAuthMethodProps) => {
  const { subscription } = useSubscription();
  const { permission } = useOrgPermission();

  const canAttachTemplates = permission.can(
    OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
    OrgPermissionSubjects.MachineIdentityAuthTemplate
  );

  const { data, isPending } = useGetIdentityOidcAuth(identityId);

  const { data: templates } = useGetAvailableTemplates(MachineIdentityAuthMethod.OIDC, {
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
          <EmptyTitle>Could not find OIDC Auth associated with this Identity.</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  const linkedTemplateName = templates?.find((template) => template.id === data.templateId)?.name;
  const configurationLabel = data.templateId
    ? (linkedTemplateName ?? "Linked template")
    : "Custom Configuration";

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
      <IdentityAuthFieldDisplay className="col-span-2" label="OIDC Discovery URL">
        {data.oidcDiscoveryUrl}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Issuer">
        {data.boundIssuer}
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
      <IdentityAuthFieldDisplay className="col-span-2" label="Subject">
        {data.boundSubject}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Audiences">
        {data.boundAudiences
          ?.split(",")
          .map((name) => name.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Claims">
        {Object.keys(data.boundClaims).length && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="neutral">
                <EyeIcon />
                Reveal
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xl p-2">
              <pre className="rounded-sm bg-container p-2 whitespace-pre-wrap">
                {JSON.stringify(data.boundClaims, null, 2)}
              </pre>
            </TooltipContent>
          </Tooltip>
        )}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Claim Metadata Mapping">
        {data.claimMetadataMapping && Object.keys(data.claimMetadataMapping).length && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="neutral">
                <EyeIcon />
                Reveal
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xl p-2">
              <pre className="rounded-sm bg-container p-2 whitespace-pre-wrap">
                {JSON.stringify(data.claimMetadataMapping, null, 2)}
              </pre>
            </TooltipContent>
          </Tooltip>
        )}
      </IdentityAuthFieldDisplay>
    </DetailGroup>
  );
};
