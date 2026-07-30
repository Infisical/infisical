import { Control, Controller } from "react-hook-form";
import { SingleValue } from "react-select";
import { Info } from "lucide-react";

import {
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";
import { TAzureDNSZone } from "@app/hooks/api/appConnections/azure-dns";
import { TCloudflareZone } from "@app/hooks/api/appConnections/cloudflare";
import { TDNSMadeEasyZone } from "@app/hooks/api/appConnections/dns-made-easy";
import { AcmeDnsProvider } from "@app/hooks/api/ca";
import {
  ACME_DNS_PROVIDER_APP_CONNECTION_MAP,
  ACME_DNS_PROVIDER_NAME_MAP
} from "@app/hooks/api/ca/constants";

import { AppConnectionSelectField } from "./AppConnectionSelectField";
import { REQUIRED_EAB_DIRECTORIES } from "./constants";
import { FormData } from "./schema";

type Props = {
  control: Control<FormData>;
  isExistingCa: boolean;
  dnsProvider?: AcmeDnsProvider;
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
    <Controller
      control={control}
      name="configuration.dnsProviderConfig.provider"
      defaultValue={AcmeDnsProvider.ROUTE53}
      render={({ field: { onChange, value }, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>DNS Provider</FieldLabel>
          <Select value={value} onValueChange={(val) => onChange(val)} disabled={isExistingCa}>
            <SelectTrigger className="w-full" isError={Boolean(error)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {Object.values(AcmeDnsProvider).map((provider) => (
                <SelectItem value={String(provider)} key={provider}>
                  {ACME_DNS_PROVIDER_NAME_MAP[provider]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={[error]} />
        </Field>
      )}
    />
    <AppConnectionSelectField
      control={control}
      name="configuration.dnsAppConnection"
      label="DNS App Connection"
      options={availableConnections}
      isLoading={isPending}
      tooltip={
        dnsProvider
          ? `${ACME_DNS_PROVIDER_NAME_MAP[dnsProvider]} uses the ${APP_CONNECTION_MAP[ACME_DNS_PROVIDER_APP_CONNECTION_MAP[dnsProvider]].name} App Connection. You can create one in the Organization Settings page.`
          : "Select a DNS provider first"
      }
    />
    {dnsProvider === AcmeDnsProvider.ROUTE53 && (
      <Controller
        control={control}
        defaultValue=""
        name="configuration.dnsProviderConfig.hostedZoneId"
        render={({ field, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              Hosted Zone ID <span className="text-danger">*</span>
            </FieldLabel>
            <Input {...field} placeholder="Z040441124N1GOOMCQYX1" isError={Boolean(error)} />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    )}
    {dnsProvider === AcmeDnsProvider.Cloudflare && (
      <Controller
        name="configuration.dnsProviderConfig.hostedZoneId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>Zone</FieldLabel>
            <FilterableSelect
              isLoading={isZonesPending && !!dnsAppConnection.id}
              isDisabled={!dnsAppConnection.id}
              value={
                cloudflareZones.find((zone) => zone.id === value) ||
                (value ? { id: value, name: value } : null)
              }
              onChange={(option) => {
                onChange((option as SingleValue<TCloudflareZone>)?.id ?? null);
              }}
              options={cloudflareZones}
              placeholder="Select a zone..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    )}
    {dnsProvider === AcmeDnsProvider.DNSMadeEasy && (
      <Controller
        name="configuration.dnsProviderConfig.hostedZoneId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>Zone</FieldLabel>
            <FilterableSelect
              isLoading={isDNSMadeEasyZonesPending && !!dnsAppConnection.id}
              isDisabled={!dnsAppConnection.id}
              value={
                dnsMadeEasyZones.find((zone) => zone.id === value) ||
                (value ? { id: value, name: value } : null)
              }
              onChange={(option) => {
                onChange((option as SingleValue<TDNSMadeEasyZone>)?.id ?? null);
              }}
              options={dnsMadeEasyZones}
              placeholder="Select a zone..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    )}
    {dnsProvider === AcmeDnsProvider.AzureDNS && (
      <Controller
        name="configuration.dnsProviderConfig.hostedZoneId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>Zone</FieldLabel>
            <FilterableSelect
              isLoading={isAzureDNSZonesPending && !!dnsAppConnection.id}
              isDisabled={!dnsAppConnection.id}
              value={
                azureDnsZones.find((zone) => zone.id === value) ||
                (value ? { id: value, name: value } : null)
              }
              onChange={(option) => {
                onChange((option as SingleValue<TAzureDNSZone>)?.id ?? null);
              }}
              options={azureDnsZones}
              placeholder="Select a zone..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    )}
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
