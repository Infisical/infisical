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
import { useGetIdentitySpiffeAuth } from "@app/hooks/api";
import { SpiffeTrustBundleProfile } from "@app/hooks/api/identities/enums";

import { IdentityAuthAccessTokenFields, IdentityAuthFieldDisplay } from "../helpers";
import { ViewAuthMethodProps } from "../types";

const PROFILE_DISPLAY_MAP: Record<string, string> = {
  [SpiffeTrustBundleProfile.STATIC]: "Static",
  [SpiffeTrustBundleProfile.HTTPS_WEB_BUNDLE]: "HTTPS Web Bundle"
};

export const IdentitySpiffeAuthContent = ({ identityId }: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentitySpiffeAuth(identityId);

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
          <EmptyTitle>Could not find SPIFFE Auth associated with this Identity.</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  const { trustBundleDistribution: dist } = data;

  return (
    <DetailGroup className="grid grid-cols-2 gap-x-6 gap-y-5">
      <IdentityAuthFieldDisplay className="col-span-2" label="Trust Domain">
        {data.trustDomain}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed SPIFFE IDs">
        {data.allowedSpiffeIds
          ?.split(",")
          .map((id) => id.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Audiences">
        {data.allowedAudiences
          ?.split(",")
          .map((aud) => aud.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Trust Bundle Profile">
        {PROFILE_DISPLAY_MAP[dist.profile] || dist.profile}
      </IdentityAuthFieldDisplay>
      {dist.profile === SpiffeTrustBundleProfile.STATIC ? (
        <IdentityAuthFieldDisplay className="col-span-2" label="CA Bundle JWKS">
          {dist.bundle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="neutral">
                  <EyeIcon />
                  Reveal
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xl p-2">
                <pre className="rounded-sm bg-container p-2 break-words whitespace-pre-wrap">
                  {dist.bundle}
                </pre>
              </TooltipContent>
            </Tooltip>
          )}
        </IdentityAuthFieldDisplay>
      ) : (
        <>
          <IdentityAuthFieldDisplay className="col-span-2" label="Bundle Endpoint URL">
            {dist.endpointUrl}
          </IdentityAuthFieldDisplay>
          <IdentityAuthFieldDisplay className="col-span-2" label="Root CA Certificate">
            {dist.caCert && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="neutral">
                    <EyeIcon />
                    Reveal
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xl p-2">
                  <p className="rounded-sm bg-container p-2 break-words">{dist.caCert}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </IdentityAuthFieldDisplay>
          <IdentityAuthFieldDisplay label="Last Refreshed">
            {dist.cachedBundleLastRefreshedAt
              ? new Date(dist.cachedBundleLastRefreshedAt).toLocaleString()
              : null}
          </IdentityAuthFieldDisplay>
          <IdentityAuthFieldDisplay label="Bundle Refresh Hint (seconds)">
            {dist.refreshHintSeconds}
          </IdentityAuthFieldDisplay>
        </>
      )}
      <IdentityAuthAccessTokenFields
        accessTokenTTL={data.accessTokenTTL}
        accessTokenMaxTTL={data.accessTokenMaxTTL}
        accessTokenNumUsesLimit={data.accessTokenNumUsesLimit}
        accessTokenTrustedIps={data.accessTokenTrustedIps}
      />
    </DetailGroup>
  );
};
