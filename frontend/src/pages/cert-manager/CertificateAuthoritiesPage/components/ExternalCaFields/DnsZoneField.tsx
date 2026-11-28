import { Control, Controller } from "react-hook-form";
import { Info } from "lucide-react";

import {
  Combobox,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { getApiErrorMessage } from "@app/helpers/errors";
import { useAzureDNSConnectionListZones } from "@app/hooks/api/appConnections/azure-dns";
import { useCloudflareConnectionListZones } from "@app/hooks/api/appConnections/cloudflare";
import { useDNSMadeEasyConnectionListZones } from "@app/hooks/api/appConnections/dns-made-easy";
import { usePowerDnsConnectionListZones } from "@app/hooks/api/appConnections/powerdns";
import { useUltraDNSConnectionListZones } from "@app/hooks/api/appConnections/ultradns";
import { AcmeDnsProvider } from "@app/hooks/api/ca";

import { TAcmeDnsZone } from "./AcmeFields";
import { GcpCloudDnsZoneFields } from "./GcpCloudDnsZoneFields";
import { FormData } from "./schema";

const DIGICERT_ZONE_TOOLTIP = "The DNS zone the persistent DNS TXT record is written to.";

type Props = {
  control: Control<FormData>;
  name: `configuration.dnsZones.${number}.hostedZoneId`;
  provider: AcmeDnsProvider;
  connectionId: string;
};

export const DnsZoneField = ({ control, name, provider, connectionId }: Props) => {
  const getZoneQueryOptions = (zoneProvider: AcmeDnsProvider) => ({
    enabled: provider === zoneProvider && Boolean(connectionId)
  });

  const cloudflareZones = useCloudflareConnectionListZones(
    connectionId,
    getZoneQueryOptions(AcmeDnsProvider.Cloudflare)
  );
  const dnsMadeEasyZones = useDNSMadeEasyConnectionListZones(
    connectionId,
    getZoneQueryOptions(AcmeDnsProvider.DNSMadeEasy)
  );
  const azureDnsZones = useAzureDNSConnectionListZones(
    connectionId,
    getZoneQueryOptions(AcmeDnsProvider.AzureDNS)
  );
  const powerDnsZones = usePowerDnsConnectionListZones(
    connectionId,
    getZoneQueryOptions(AcmeDnsProvider.PowerDns)
  );
  const ultraDnsZones = useUltraDNSConnectionListZones(
    connectionId,
    getZoneQueryOptions(AcmeDnsProvider.UltraDNS)
  );

  if (provider === AcmeDnsProvider.ROUTE53) {
    return (
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              Hosted Zone ID <span className="text-danger">*</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  The ID of the public Route 53 hosted zone the persistent DNS TXT record is written
                  to.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Input {...field} placeholder="Z040441124N1GOOMCQYX1" isError={Boolean(error)} />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    );
  }

  if (provider === AcmeDnsProvider.Rfc2136) {
    return (
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              Zone <span className="text-danger">*</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  The name of the zone on your DNS server that the persistent DNS TXT record is
                  written to.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Input {...field} placeholder="example.com" isError={Boolean(error)} />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    );
  }

  if (provider === AcmeDnsProvider.GcpCloudDns) {
    return (
      <GcpCloudDnsZoneFields
        key={connectionId}
        control={control}
        connectionId={connectionId}
        name={name}
        zoneTooltip={DIGICERT_ZONE_TOOLTIP}
      />
    );
  }

  const zoneQueries: Partial<
    Record<AcmeDnsProvider, { data?: TAcmeDnsZone[]; isPending: boolean; error: unknown }>
  > = {
    [AcmeDnsProvider.Cloudflare]: cloudflareZones,
    [AcmeDnsProvider.DNSMadeEasy]: dnsMadeEasyZones,
    [AcmeDnsProvider.AzureDNS]: azureDnsZones,
    [AcmeDnsProvider.PowerDns]: powerDnsZones,
    [AcmeDnsProvider.UltraDNS]: ultraDnsZones
  };
  const {
    data: zones = [],
    isPending: isZonesPending = false,
    error: zonesError
  } = zoneQueries[provider] ?? {};
  const zonesQueryError = zonesError
    ? {
        message:
          getApiErrorMessage(zonesError) ??
          "Failed to list zones for this connection. Check the connection's credentials."
      }
    : undefined;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange, ref }, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            Zone <span className="text-danger">*</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info />
              </TooltipTrigger>
              <TooltipContent className="max-w-md">{DIGICERT_ZONE_TOOLTIP}</TooltipContent>
            </Tooltip>
          </FieldLabel>
          <Combobox
            isClearable={false}
            includeMissingSelectedOptions={false}
            ref={ref}
            isLoading={isZonesPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={
              zones.find((zone) => zone.id === value) || (value ? { id: value, name: value } : null)
            }
            onValueChange={(option) => {
              onChange(option.id);
            }}
            options={zones}
            placeholder="Select a zone..."
            getOptionLabel={(option) => option.name.replace(/\.$/, "")}
            getOptionValue={(option) => option.id}
            isError={Boolean(zonesQueryError ?? error)}
          />
          <FieldError errors={[zonesQueryError ?? error]} />
        </Field>
      )}
    />
  );
};
