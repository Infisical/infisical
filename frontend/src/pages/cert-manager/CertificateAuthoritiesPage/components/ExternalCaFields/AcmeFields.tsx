import { Control, Controller } from "react-hook-form";
import { Info } from "lucide-react";

import {
  Field,
  FieldError,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";
import { TAzureDNSZone } from "@app/hooks/api/appConnections/azure-dns";
import { TCloudflareZone } from "@app/hooks/api/appConnections/cloudflare";
import { TDNSMadeEasyZone } from "@app/hooks/api/appConnections/dns-made-easy";
import { CaDnsProvider } from "@app/hooks/api/ca";

import { REQUIRED_EAB_DIRECTORIES } from "./constants";
import { DnsProviderFields } from "./DnsProviderFields";
import { FormData } from "./schema";

type Props = {
  control: Control<FormData>;
  isExistingCa: boolean;
  dnsProvider?: CaDnsProvider;
  directoryUrl?: string;
  dnsAppConnection: { id: string; name: string };
  availableConnections: TAvailableAppConnection[];
  isPending: boolean;
  cloudflareZones: TCloudflareZone[];
  isZonesPending: boolean;
  dnsMadeEasyZones: TDNSMadeEasyZone[];
  isDNSMadeEasyZonesPending: boolean;
  azureDnsZones: TAzureDNSZone[];
  isAzureDNSZonesPending: boolean;
};

export const AcmeFields = ({
  control,
  isExistingCa,
  dnsProvider,
  directoryUrl,
  dnsAppConnection,
  availableConnections,
  isPending,
  cloudflareZones,
  isZonesPending,
  dnsMadeEasyZones,
  isDNSMadeEasyZonesPending,
  azureDnsZones,
  isAzureDNSZonesPending
}: Props) => (
  <>
    <DnsProviderFields
      control={control}
      isExistingCa={isExistingCa}
      dnsProvider={dnsProvider}
      dnsAppConnection={dnsAppConnection}
      availableConnections={availableConnections}
      isPending={isPending}
      cloudflareZones={cloudflareZones}
      isZonesPending={isZonesPending}
      dnsMadeEasyZones={dnsMadeEasyZones}
      isDNSMadeEasyZonesPending={isDNSMadeEasyZonesPending}
      azureDnsZones={azureDnsZones}
      isAzureDNSZonesPending={isAzureDNSZonesPending}
    />
    <Controller
      control={control}
      defaultValue=""
      name="configuration.directoryUrl"
      render={({ field, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            Directory URL <span className="text-danger">*</span>
          </FieldLabel>
          <Input
            {...field}
            placeholder="https://acme-v02.api.letsencrypt.org/directory"
            isError={Boolean(error)}
          />
          <FieldError errors={[error]} />
        </Field>
      )}
    />
    <Controller
      control={control}
      defaultValue=""
      name="configuration.accountEmail"
      render={({ field, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            Account Email <span className="text-danger">*</span>
          </FieldLabel>
          <Input {...field} placeholder="user@infisical.com" isError={Boolean(error)} />
          <FieldError errors={[error]} />
        </Field>
      )}
    />
    <Controller
      control={control}
      defaultValue=""
      name="configuration.eabKid"
      render={({ field, fieldState: { error } }) => {
        const eabRequired = REQUIRED_EAB_DIRECTORIES.includes(directoryUrl || "");
        return (
          <Field className="mb-4">
            <FieldLabel>
              EAB Key Identifier (KID){" "}
              {eabRequired ? (
                <span className="text-danger">*</span>
              ) : (
                <span className="text-muted">(optional)</span>
              )}
            </FieldLabel>
            <Input
              {...field}
              placeholder="abc123def456ghi789jkl012mno345pqr678stu901vwx234yz"
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        );
      }}
    />
    <Controller
      control={control}
      defaultValue=""
      name="configuration.eabHmacKey"
      render={({ field, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            EAB HMAC Key <span className="text-muted">(optional)</span>
          </FieldLabel>
          <Input
            type="password"
            autoComplete="new-password"
            {...field}
            isError={Boolean(error)}
            placeholder={
              isExistingCa
                ? undefined
                : "dGhpc2lzYW5leGFtcGxlaG1hY2tleWZvcmRpZ2ljZXJ0YWNtZXRlc3RpbmcxMjM0NTY3ODkw"
            }
          />
          <FieldError errors={[error]} />
        </Field>
      )}
    />
    <Controller
      control={control}
      defaultValue=""
      name="configuration.dnsResolver"
      render={({ field, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            DNS Resolver IP <span className="text-muted">(optional)</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info />
              </TooltipTrigger>
              <TooltipContent className="max-w-md">
                A custom DNS resolver IP address used to verify DNS propagation during ACME
                challenges. Must be a valid IP (e.g. 8.8.8.8). Leave empty to use the system
                default.
              </TooltipContent>
            </Tooltip>
          </FieldLabel>
          <Input {...field} placeholder="8.8.8.8" isError={Boolean(error)} />
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  </>
);
