import { Control, Controller } from "react-hook-form";
import { SingleValue } from "react-select";

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
  SelectValue
} from "@app/components/v3";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";
import { TAzureDNSZone } from "@app/hooks/api/appConnections/azure-dns";
import { TCloudflareZone } from "@app/hooks/api/appConnections/cloudflare";
import { TDNSMadeEasyZone } from "@app/hooks/api/appConnections/dns-made-easy";
import { CaDnsProvider } from "@app/hooks/api/ca";
import {
  CA_DNS_PROVIDER_APP_CONNECTION_MAP,
  CA_DNS_PROVIDER_NAME_MAP
} from "@app/hooks/api/ca/constants";

import { AppConnectionSelectField } from "./AppConnectionSelectField";
import { FormData } from "./schema";

// Shared DNS provider + app connection + hosted zone/record picker used by any CA type that
// automates a DNS TXT record (ACME's dns-01 challenge, DigiCert's DCV). Both configuration
// shapes use the same `dnsAppConnection`/`dnsProviderConfig` field names.
type Props = {
  control: Control<FormData>;
  isExistingCa: boolean;
  dnsProvider?: CaDnsProvider;
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

export const DnsProviderFields = ({
  control,
  isExistingCa,
  dnsProvider,
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
      defaultValue={CaDnsProvider.ROUTE53}
      render={({ field: { onChange, value }, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>DNS Provider</FieldLabel>
          <Select value={value} onValueChange={(val) => onChange(val)} disabled={isExistingCa}>
            <SelectTrigger className="w-full" isError={Boolean(error)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {Object.values(CaDnsProvider).map((provider) => (
                <SelectItem value={String(provider)} key={provider}>
                  {CA_DNS_PROVIDER_NAME_MAP[provider]}
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
          ? `${CA_DNS_PROVIDER_NAME_MAP[dnsProvider]} uses the ${APP_CONNECTION_MAP[CA_DNS_PROVIDER_APP_CONNECTION_MAP[dnsProvider]].name} App Connection. You can create one in the Organization Settings page.`
          : "Select a DNS provider first"
      }
    />
    {dnsProvider === CaDnsProvider.ROUTE53 && (
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
    {dnsProvider === CaDnsProvider.Cloudflare && (
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
    {dnsProvider === CaDnsProvider.DNSMadeEasy && (
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
    {dnsProvider === CaDnsProvider.AzureDNS && (
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
  </>
);
