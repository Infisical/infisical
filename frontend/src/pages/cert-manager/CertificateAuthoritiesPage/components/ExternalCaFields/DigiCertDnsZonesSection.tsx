import { Control, useFieldArray, UseFormSetValue, useWatch } from "react-hook-form";
import { ChevronDownIcon, PlusIcon, TrashIcon } from "lucide-react";

import {
  Button,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyTitle,
  IconButton,
  Label,
  ProviderIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AcmeDnsProvider } from "@app/hooks/api/ca";
import {
  ACME_DNS_PROVIDER_APP_CONNECTION_MAP,
  ACME_DNS_PROVIDER_NAME_MAP
} from "@app/hooks/api/ca/constants";
import { PkiDocsUrls } from "@app/pages/cert-manager/pki-docs-urls";

import { AppConnectionSelectField } from "./AppConnectionSelectField";
import { DIGICERT_MAX_DNS_ZONES } from "./constants";
import { DnsZoneField } from "./DnsZoneField";
import { FormData } from "./schema";

const DNS_PROVIDERS = Object.values(AcmeDnsProvider).sort((a, b) =>
  ACME_DNS_PROVIDER_NAME_MAP[a].localeCompare(ACME_DNS_PROVIDER_NAME_MAP[b])
);

const getProviderImage = (provider: AcmeDnsProvider) =>
  APP_CONNECTION_MAP[ACME_DNS_PROVIDER_APP_CONNECTION_MAP[provider]].image;

const AddDnsZoneMenu = ({
  onAdd,
  isDisabled
}: {
  onAdd: (provider: AcmeDnsProvider) => void;
  isDisabled?: boolean;
}) => {
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" isDisabled={isDisabled}>
          <PlusIcon />
          Add DNS Zone
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-56">
        {DNS_PROVIDERS.map((provider) => (
          <DropdownMenuItem key={provider} onClick={() => onAdd(provider)}>
            <ProviderIcon
              icon={getProviderImage(provider)}
              alt={`${ACME_DNS_PROVIDER_NAME_MAP[provider]} logo`}
              className="size-4 object-contain"
            />
            {ACME_DNS_PROVIDER_NAME_MAP[provider]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!isDisabled) return menu;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable wrapper required so the tooltip surfaces on keyboard focus despite the inner button being disabled */}
        <span tabIndex={0}>{menu}</span>
      </TooltipTrigger>
      <TooltipContent side="left">
        A CA can link up to {DIGICERT_MAX_DNS_ZONES} DNS zones
      </TooltipContent>
    </Tooltip>
  );
};

const DnsZoneCard = ({
  control,
  setValue,
  index,
  provider,
  onRemove
}: {
  control: Control<FormData>;
  setValue: UseFormSetValue<FormData>;
  index: number;
  provider: AcmeDnsProvider;
  onRemove: () => void;
}) => {
  const { currentProject } = useProject();
  const app = ACME_DNS_PROVIDER_APP_CONNECTION_MAP[provider];
  const providerName = ACME_DNS_PROVIDER_NAME_MAP[provider];

  const { data: connections = [], isPending } = useListAvailableAppConnections(
    app,
    currentProject.id
  );

  const zone = useWatch({ control, name: `configuration.dnsZones.${index}` });

  return (
    <div className="flex flex-col rounded-md border border-border px-4 pt-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ProviderIcon
            icon={getProviderImage(provider)}
            alt={`${providerName} logo`}
            className="size-4 shrink-0 object-contain"
          />
          <span className="truncate text-sm font-medium text-foreground">{providerName}</span>
        </div>
        <IconButton aria-label="Remove DNS zone" variant="ghost" size="xs" onClick={onRemove}>
          <TrashIcon />
        </IconButton>
      </div>
      <AppConnectionSelectField
        control={control}
        name={`configuration.dnsZones.${index}.appConnection`}
        label="DNS App Connection"
        required
        options={connections}
        isLoading={isPending}
        createApp={app}
        onAfterChange={() =>
          setValue(`configuration.dnsZones.${index}.hostedZoneId`, "", { shouldDirty: true })
        }
        tooltip={`${providerName} uses the ${APP_CONNECTION_MAP[app].name} App Connection to write the persistent DNS TXT record.`}
      />
      <DnsZoneField
        control={control}
        name={`configuration.dnsZones.${index}.hostedZoneId`}
        provider={provider}
        connectionId={zone?.appConnection?.id ?? ""}
      />
    </div>
  );
};

type Props = {
  control: Control<FormData>;
  setValue: UseFormSetValue<FormData>;
};

export const DigiCertDnsZonesSection = ({ control, setValue }: Props) => {
  const { fields, append, remove } = useFieldArray({ control, name: "configuration.dnsZones" });

  const addZone = (provider: AcmeDnsProvider) =>
    append({ provider, appConnection: { id: "", name: "" }, hostedZoneId: "" });

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Label>
            Domain Validation
            <DocumentationLinkBadge variant="minified" href={PkiDocsUrls.ca.digicertDirect} />
          </Label>
          <span className="text-xs text-muted">
            Each linked zone gets one persistent DNS TXT record at its top so DigiCert can validate
            every domain in it. Domains outside these zones wait for validation in CertCentral.
          </span>
        </div>
        {fields.length > 0 && (
          <AddDnsZoneMenu onAdd={addZone} isDisabled={fields.length >= DIGICERT_MAX_DNS_ZONES} />
        )}
      </div>
      {fields.length === 0 ? (
        <Empty className="border">
          <EmptyTitle>No DNS zones linked</EmptyTitle>
          <EmptyContent>
            <AddDnsZoneMenu onAdd={addZone} />
          </EmptyContent>
        </Empty>
      ) : (
        fields.map((field, index) => (
          <DnsZoneCard
            key={field.id}
            control={control}
            setValue={setValue}
            index={index}
            provider={field.provider}
            onRemove={() => remove(index)}
          />
        ))
      )}
    </div>
  );
};
