import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import {
  TLaravelForgeOrganization,
  TLaravelForgeServer,
  TLaravelForgeSite,
  useLaravelForgeConnectionListOrganizations,
  useLaravelForgeConnectionListServers,
  useLaravelForgeConnectionListSites
} from "@app/hooks/api/appConnections/laravel-forge";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const LaravelForgeSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.LaravelForge }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const orgSlug = useWatch({ name: "destinationConfig.orgSlug", control });
  const serverId = useWatch({ name: "destinationConfig.serverId", control });

  const { data: organizations, isLoading: isOrganizationsLoading } =
    useLaravelForgeConnectionListOrganizations(connectionId, {
      enabled: Boolean(connectionId)
    });

  const { data: servers, isLoading: isServersLoading } = useLaravelForgeConnectionListServers(
    connectionId,
    orgSlug,
    {
      enabled: Boolean(connectionId && orgSlug)
    }
  );

  const { data: sites, isLoading: isSitesLoading } = useLaravelForgeConnectionListSites(
    connectionId,
    orgSlug,
    serverId,
    {
      enabled: Boolean(connectionId && orgSlug && serverId)
    }
  );

  const handleChangeConnection = () => {
    setValue("destinationConfig.orgSlug", "");
    setValue("destinationConfig.serverId", "");
    setValue("destinationConfig.siteId", "");
    setValue("destinationConfig.orgName", "");
    setValue("destinationConfig.serverName", "");
    setValue("destinationConfig.siteName", "");
  };

  return (
    <FieldGroup>
      <SecretSyncConnectionField onChange={handleChangeConnection} />

      <Controller
        name="destinationConfig.orgSlug"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Organization</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isOrganizationsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={organizations?.find((org) => org.slug === value) ?? null}
                onChange={(option) => {
                  const selectedOrg = option as SingleValue<TLaravelForgeOrganization>;
                  onChange(selectedOrg?.slug ?? "");
                  setValue("destinationConfig.orgName", selectedOrg?.name ?? "");
                  setValue("destinationConfig.serverId", "");
                  setValue("destinationConfig.siteId", "");
                }}
                options={organizations}
                placeholder="Select an organization..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.serverId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Server</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isServersLoading && Boolean(connectionId && orgSlug)}
                isDisabled={!connectionId || !orgSlug}
                value={servers?.find((server) => server.id === value) ?? null}
                onChange={(option) => {
                  const selectedServer = option as SingleValue<TLaravelForgeServer>;
                  onChange(selectedServer?.id ?? "");
                  setValue("destinationConfig.serverName", selectedServer?.name ?? "");
                  setValue("destinationConfig.siteId", "");
                }}
                options={servers}
                placeholder="Select a server..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.siteId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Site</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isSitesLoading && Boolean(connectionId && orgSlug && serverId)}
                isDisabled={!connectionId || !orgSlug || !serverId}
                value={sites?.find((site) => site.id === value) ?? null}
                onChange={(option) => {
                  const selectedSite = option as SingleValue<TLaravelForgeSite>;
                  onChange(selectedSite?.id ?? "");
                  setValue("destinationConfig.siteName", selectedSite?.name ?? "");
                }}
                options={sites}
                placeholder="Select a site..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
