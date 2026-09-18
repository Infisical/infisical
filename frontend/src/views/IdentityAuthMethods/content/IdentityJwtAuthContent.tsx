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
import { useGetIdentityJwtAuth } from "@app/hooks/api";
import { IdentityJwtConfigurationType } from "@app/hooks/api/identities/enums";

import { IdentityAuthAccessTokenFields, IdentityAuthFieldDisplay } from "../helpers";
import { ViewAuthMethodProps } from "../types";

export const IdentityJwtAuthContent = ({ identityId }: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityJwtAuth(identityId);

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
          <EmptyTitle>Could not find JWT Auth associated with this Identity.</EmptyTitle>
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
      <IdentityAuthFieldDisplay label="Configuration Type">
        {data.configurationType === IdentityJwtConfigurationType.JWKS ? "JWKS" : "Static"}
      </IdentityAuthFieldDisplay>
      {data.configurationType === IdentityJwtConfigurationType.JWKS ? (
        <>
          <IdentityAuthFieldDisplay className="col-span-2" label="JWKS URL">
            {data.jwksUrl}
          </IdentityAuthFieldDisplay>
          <IdentityAuthFieldDisplay className="col-span-2" label="JWKS CA Certificate">
            {data.jwksCaCert && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="neutral">
                    <EyeIcon />
                    Reveal
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xl p-2">
                  <p className="rounded-sm bg-container p-2 break-words">{data.jwksCaCert}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </IdentityAuthFieldDisplay>
        </>
      ) : (
        <IdentityAuthFieldDisplay className="col-span-2" label="Public Keys">
          {data.publicKeys.length && (
            <div className="flex flex-wrap gap-1">
              {data.publicKeys.map((key, index) => (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <Badge variant="neutral">
                      <EyeIcon />
                      Key {index + 1}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xl p-2">
                    <p className="rounded-sm bg-container p-2 break-words whitespace-normal">
                      {key}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </IdentityAuthFieldDisplay>
      )}
      <IdentityAuthFieldDisplay className="col-span-2" label="Issuer">
        {data.boundIssuer}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Subject">
        {data.boundSubject}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Audiences">
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
    </DetailGroup>
  );
};
