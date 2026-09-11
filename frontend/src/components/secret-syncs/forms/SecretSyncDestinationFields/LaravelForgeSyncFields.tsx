import { Controller, useFormContext, useWatch } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@app/components/v3";
import {
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
            <FieldLabel
              id="secret-sync-laravel-forge-org-slug-label"
              htmlFor="secret-sync-laravel-forge-org-slug"
            >
              Organization
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-laravel-forge-org-slug-label"
                aria-describedby={error ? "secret-sync-laravel-forge-org-slug-error" : undefined}
                id="secret-sync-laravel-forge-org-slug"
                isError={Boolean(error)}
                isLoading={isOrganizationsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={organizations?.find((org) => org.slug === value) ?? null}
                onValueChange={(option) => {
                  const selectedOrg = option;
                  onChange(selectedOrg?.slug ?? "");
                  setValue("destinationConfig.orgName", selectedOrg?.name ?? "");
                  setValue("destinationConfig.serverId", "");
                  setValue("destinationConfig.siteId", "");
                }}
                options={organizations}
                placeholder="Select an organization..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id, option.slug]}
                modal
              />
              <FieldError id="secret-sync-laravel-forge-org-slug-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.serverId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-laravel-forge-server-id-label"
              htmlFor="secret-sync-laravel-forge-server-id"
            >
              Server
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-laravel-forge-server-id-label"
                aria-describedby={error ? "secret-sync-laravel-forge-server-id-error" : undefined}
                id="secret-sync-laravel-forge-server-id"
                isError={Boolean(error)}
                isLoading={isServersLoading && Boolean(connectionId && orgSlug)}
                isDisabled={!connectionId || !orgSlug}
                value={servers?.find((server) => server.id === value) ?? null}
                onValueChange={(option) => {
                  const selectedServer = option;
                  onChange(selectedServer?.id ?? "");
                  setValue("destinationConfig.serverName", selectedServer?.name ?? "");
                  setValue("destinationConfig.siteId", "");
                }}
                options={servers}
                placeholder="Select a server..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id]}
                modal
              />
              <FieldError id="secret-sync-laravel-forge-server-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.siteId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-laravel-forge-site-id-label"
              htmlFor="secret-sync-laravel-forge-site-id"
            >
              Site
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-laravel-forge-site-id-label"
                aria-describedby={error ? "secret-sync-laravel-forge-site-id-error" : undefined}
                id="secret-sync-laravel-forge-site-id"
                isError={Boolean(error)}
                isLoading={isSitesLoading && Boolean(connectionId && orgSlug && serverId)}
                isDisabled={!connectionId || !orgSlug || !serverId}
                value={sites?.find((site) => site.id === value) ?? null}
                onValueChange={(option) => {
                  const selectedSite = option;
                  onChange(selectedSite?.id ?? "");
                  setValue("destinationConfig.siteName", selectedSite?.name ?? "");
                }}
                options={sites}
                placeholder="Select a site..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id]}
                modal
              />
              <FieldError id="secret-sync-laravel-forge-site-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
