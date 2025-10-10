import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl } from "@app/components/v2";
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
  };

  return (
    <>
      <SecretSyncConnectionField onChange={handleChangeConnection} />

      <Controller
        name="destinationConfig.orgSlug"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message} label="Organization">
            <FilterableSelect
              menuPlacement="top"
              isLoading={isOrganizationsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={organizations?.find((org) => org.slug === value) ?? null}
              onChange={(option) => {
                const selectedOrg = option as SingleValue<TLaravelForgeOrganization>;
                onChange(selectedOrg?.slug ?? "");
                setValue("destinationConfig.serverId", "");
                setValue("destinationConfig.siteId", "");
              }}
              options={organizations}
              placeholder="Select an organization..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />

      <Controller
        name="destinationConfig.serverId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message} label="Server">
            <FilterableSelect
              menuPlacement="top"
              isLoading={isServersLoading && Boolean(connectionId && orgSlug)}
              isDisabled={!connectionId || !orgSlug}
              value={servers?.find((server) => server.id === value) ?? null}
              onChange={(option) => {
                const selectedServer = option as SingleValue<TLaravelForgeServer>;
                onChange(selectedServer?.id ?? "");
                setValue("destinationConfig.siteId", "");
              }}
              options={servers}
              placeholder="Select a server..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />

      <Controller
        name="destinationConfig.siteId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message} label="Site">
            <FilterableSelect
              menuPlacement="top"
              isLoading={isSitesLoading && Boolean(connectionId && orgSlug && serverId)}
              isDisabled={!connectionId || !orgSlug || !serverId}
              value={sites?.find((site) => site.id === value) ?? null}
              onChange={(option) => {
                const selectedSite = option as SingleValue<TLaravelForgeSite>;
                onChange(selectedSite?.id ?? "");
              }}
              options={sites}
              placeholder="Select a site..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />
    </>
  );
};
