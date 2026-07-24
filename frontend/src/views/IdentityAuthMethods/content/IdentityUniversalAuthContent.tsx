import { BanIcon, CheckIcon, CopyIcon } from "lucide-react";

import {
  DetailGroup,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  PageLoader,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import {
  IdentityAuthMethod,
  useGetIdentityUniversalAuth,
  useGetIdentityUniversalAuthClientSecrets
} from "@app/hooks/api";

import {
  IdentityAuthAccessTokenFields,
  IdentityAuthFieldDisplay,
  IdentityAuthLockoutFields,
  IdentityUniversalAuthClientSecretsTable
} from "../helpers";
import { ViewAuthMethodProps } from "../types";

export const IdentityUniversalAuthContent = ({
  identityId,
  isLockedOut,
  onMutated
}: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityUniversalAuth(identityId);
  const { data: clientSecrets = [], isPending: clientSecretsPending } =
    useGetIdentityUniversalAuthClientSecrets(identityId);

  const [copyTextClientId, isCopyingClientId, setCopyTextClientId] = useTimedReset<string>({
    initialState: "Copy Client ID to clipboard"
  });

  if (isPending || clientSecretsPending) {
    return <PageLoader />;
  }

  if (!data) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BanIcon />
          </EmptyMedia>
          <EmptyTitle>Could not find Universal Auth associated with this Identity.</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <DetailGroup className="grid grid-cols-2 gap-x-6 gap-y-5">
      <IdentityAuthAccessTokenFields
        accessTokenPeriod={data.accessTokenPeriod}
        accessTokenTTL={data.accessTokenTTL}
        accessTokenMaxTTL={data.accessTokenMaxTTL}
        accessTokenNumUsesLimit={data.accessTokenNumUsesLimit}
        accessTokenTrustedIps={data.accessTokenTrustedIps}
      />
      <IdentityAuthFieldDisplay label="Client Secret Trusted IPs">
        {data.clientSecretTrustedIps.map((ip) => ip.ipAddress).join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Lockout">
        {data.lockoutEnabled ? "Enabled" : "Disabled"}
      </IdentityAuthFieldDisplay>
      {data.lockoutEnabled && (
        <IdentityAuthLockoutFields
          identityId={identityId}
          authMethod={IdentityAuthMethod.UNIVERSAL_AUTH}
          isLockedOut={isLockedOut ?? false}
          onResetSuccess={() => onMutated?.()}
          data={data}
        />
      )}
      <div className="col-span-2 my-3 flex flex-col gap-2">
        <div className="border-b border-border pb-2 text-foreground">Client ID</div>
        <div className="flex items-center gap-2">
          <span className="text-sm">{data.clientId}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                variant="ghost"
                size="xs"
                aria-label="Copy Client ID"
                onClick={() => {
                  navigator.clipboard.writeText(data.clientId);
                  setCopyTextClientId("Copied");
                }}
              >
                {isCopyingClientId ? <CheckIcon /> : <CopyIcon />}
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>{copyTextClientId}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <IdentityUniversalAuthClientSecretsTable
        clientSecrets={clientSecrets}
        identityId={identityId}
      />
    </DetailGroup>
  );
};
