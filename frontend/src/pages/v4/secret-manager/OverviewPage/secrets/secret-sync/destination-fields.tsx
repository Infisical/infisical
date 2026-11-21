import { useState } from "react";
import { Controller, type FieldValues, useFieldArray, useWatch } from "react-hook-form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@infisical/cipher/ui/accordion";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { FieldDescription } from "@infisical/cipher/ui/field";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@infisical/cipher/ui/hover-card";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@infisical/cipher/ui/table";

import { AWS_REGIONS } from "@app/helpers/appConnections";
import { GCP_SYNC_SCOPES } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";

import { useV4Adapter } from "../../../../data/adapters";
import {
  ConnectionField,
  type ReviewItems,
  SwitchField,
  SyncField,
  type SyncView,
  TextField,
  useConnectionOptions,
  useSyncForm,
  yesNo
} from "./sync-fields";

import styles from "./secret-sync.module.css";

const STS_REGION_TIP =
  "If the connection has a custom STS endpoint, this must match its STS region.";

function AwsRegionField() {
  const { control } = useSyncForm();
  return (
    <Controller
      control={control}
      name="destinationConfig.region"
      render={({ field, fieldState: { error } }) => (
        <SyncField label="Region" tooltip={STS_REGION_TIP} error={error?.message}>
          <Combobox
            label="Region"
            value={field.value ?? ""}
            onValueChange={field.onChange}
            options={AWS_REGIONS.map((region) => ({
              value: region.slug,
              label: region.name,
              meta: region.slug
            }))}
            placeholder="Select a region..."
            invalid={Boolean(error)}
          />
        </SyncField>
      )}
    />
  );
}

function AwsParameterStoreDestination() {
  const { setValue } = useSyncForm();
  return (
    <Stack gap={16}>
      <ConnectionField onChange={() => setValue("syncOptions.keyId", undefined)} />
      <AwsRegionField />
      <TextField
        name="destinationConfig.path"
        label="Path"
        placeholder="Path..."
        tooltip={
          <>
            Prepended to the key schema. For example, <code>/demo/path/</code> with{" "}
            <code>{"INFISICAL_{{secretKey}}"}</code> gives{" "}
            <code>{"/demo/path/INFISICAL_{{secretKey}}"}</code>.
          </>
        }
      />
    </Stack>
  );
}

function AwsSecretsManagerDestination() {
  const { control, setValue } = useSyncForm();
  const mappingBehavior = useWatch({ control, name: "destinationConfig.mappingBehavior" });
  return (
    <Stack gap={16}>
      <ConnectionField />
      <AwsRegionField />
      <Controller
        control={control}
        name="destinationConfig.mappingBehavior"
        render={({ field, fieldState: { error } }) => (
          <SyncField
            label="Mapping behavior"
            error={error?.message}
            tooltip={
              <Stack gap={8}>
                <span>One-to-one: each secret becomes its own AWS secret.</span>
                <span>Many-to-one: all secrets go into a single AWS secret.</span>
              </Stack>
            }
          >
            <Select
              value={field.value ?? ""}
              onValueChange={(value) => {
                field.onChange(value);
                setValue("syncOptions.syncSecretMetadataAsTags", false);
              }}
              options={[
                { value: "one-to-one", label: "One-to-one" },
                { value: "many-to-one", label: "Many-to-one" }
              ]}
              placeholder="Select an option..."
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
      {mappingBehavior === "many-to-one" && (
        <TextField
          name="destinationConfig.secretName"
          label="AWS Secrets Manager secret name"
          placeholder="Secret name..."
        />
      )}
    </Stack>
  );
}

const GITHUB_SCOPES = [
  { value: "organization", label: "Organization" },
  { value: "repository", label: "Repository" },
  { value: "repository-environment", label: "Repository environment" }
];
const GITHUB_VISIBILITY = [
  { value: "all", label: "All repositories" },
  { value: "private", label: "Private repositories" },
  { value: "selected", label: "Selected repositories" }
];

function GitHubDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, scope, visibility, org, repo, owner] = useWatch({
    control,
    name: [
      "connection.id",
      "destinationConfig.scope",
      "destinationConfig.visibility",
      "destinationConfig.org",
      "destinationConfig.repo",
      "destinationConfig.owner"
    ]
  }) as [string | undefined, string, string, string, string, string];
  const adapter = useV4Adapter("secrets");
  const organizations = useConnectionOptions(adapter.useGitHubOrganizations);
  const repositories = useConnectionOptions(adapter.useGitHubRepositories).map((entry) => ({
    id: entry.id,
    name: entry.name,
    owner: entry.owner.login
  }));
  const environments =
    adapter.useGitHubEnvironments(
      { connectionId: connectionId ?? "", owner: owner ?? "", repo: repo ?? "" },
      { enabled: Boolean(connectionId && owner && repo) }
    ).data ?? [];
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.org", "");
          setValue("destinationConfig.repo", "");
          setValue("destinationConfig.owner", "");
          setValue("destinationConfig.selectedRepositoryIds", []);
        }}
      />
      <Controller
        control={control}
        name="destinationConfig.scope"
        render={({ field, fieldState: { error } }) => (
          <SyncField label="Scope" error={error?.message}>
            <Select
              value={field.value ?? ""}
              onValueChange={field.onChange}
              options={GITHUB_SCOPES}
              placeholder="Select a scope..."
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
      {scope === "organization" && (
        <>
          <Controller
            control={control}
            name="destinationConfig.org"
            render={({ field, fieldState: { error } }) => (
              <SyncField label="Organization" error={error?.message}>
                <Combobox
                  label="Organization"
                  value={field.value ?? ""}
                  onValueChange={(value) => {
                    if (value === field.value) return;
                    field.onChange(value);
                    setValue("destinationConfig.selectedRepositoryIds", []);
                  }}
                  options={organizations.map(({ login }) => ({
                    value: login,
                    label: login
                  }))}
                  placeholder="Select an organization..."
                  disabled={!connectionId}
                  invalid={Boolean(error)}
                />
              </SyncField>
            )}
          />
          <Controller
            control={control}
            name="destinationConfig.visibility"
            defaultValue="all"
            render={({ field, fieldState: { error } }) => (
              <SyncField label="Visibility" error={error?.message}>
                <Select
                  value={field.value ?? ""}
                  onValueChange={(value) => {
                    field.onChange(value);
                    setValue("destinationConfig.selectedRepositoryIds", []);
                  }}
                  options={GITHUB_VISIBILITY}
                  placeholder="Select visibility..."
                  invalid={Boolean(error)}
                />
              </SyncField>
            )}
          />
          {visibility === "selected" && (
            <Controller
              control={control}
              name="destinationConfig.selectedRepositoryIds"
              render={({ field, fieldState: { error } }) => (
                <SyncField label="Selected repositories" error={error?.message}>
                  <Combobox
                    label="Selected repositories"
                    multiple
                    value={((field.value as number[] | undefined) ?? []).map(String)}
                    onValueChange={(ids) => field.onChange(ids.map(Number))}
                    options={repositories
                      .filter((entry) => entry.owner === org)
                      .map((entry) => ({
                        value: String(entry.id),
                        label: `${entry.owner}/${entry.name}`
                      }))}
                    placeholder="Select one or more repositories..."
                    disabled={!org || !connectionId}
                    invalid={Boolean(error)}
                  />
                </SyncField>
              )}
            />
          )}
        </>
      )}
      {scope !== "organization" && (
        <Controller
          control={control}
          name="destinationConfig.repo"
          render={({ field, fieldState: { error } }) => (
            <SyncField label="Repository" error={error?.message}>
              <Combobox
                label="Repository"
                value={String(repositories.find((entry) => entry.name === field.value)?.id ?? "")}
                onValueChange={(id) => {
                  const entry = repositories.find((candidate) => String(candidate.id) === id);
                  field.onChange(entry?.name ?? "");
                  setValue("destinationConfig.owner", entry?.owner ?? "");
                  setValue("destinationConfig.env", "");
                }}
                options={repositories.map((entry) => ({
                  value: String(entry.id),
                  label: `${entry.owner}/${entry.name}`
                }))}
                placeholder="Select a repository..."
                disabled={!connectionId}
                invalid={Boolean(error)}
              />
            </SyncField>
          )}
        />
      )}
      {scope === "repository-environment" && (
        <Controller
          control={control}
          name="destinationConfig.env"
          render={({ field, fieldState: { error } }) => (
            <SyncField label="Environment" error={error?.message}>
              <Combobox
                label="Environment"
                value={field.value ?? ""}
                onValueChange={field.onChange}
                options={(repo ? environments : []).map((env) => ({
                  value: env.name,
                  label: env.name
                }))}
                placeholder="Select an environment..."
                disabled={!connectionId || !repo}
                invalid={Boolean(error)}
              />
            </SyncField>
          )}
        />
      )}
    </Stack>
  );
}

function GcpDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, projectId, scope, replicas] = useWatch({
    control,
    name: [
      "connection.id",
      "destinationConfig.projectId",
      "destinationConfig.scope",
      "destinationConfig.userReplicaLocationIds"
    ]
  }) as [string | undefined, string, string, string[] | undefined];
  const [openItem, setOpenItem] = useState(replicas?.length ? "advanced" : "");
  const adapter = useV4Adapter("secrets");
  const projects = useConnectionOptions(adapter.useGcpProjects);
  const locationOptions = (
    adapter.useGcpLocations(
      { connectionId: connectionId ?? "", projectId: projectId ?? "" },
      { enabled: Boolean(connectionId && projectId) }
    ).data ?? []
  ).map((location) => ({
    value: location.locationId,
    label: `${location.displayName} (${location.locationId})`
  }));
  const resetLocations = () => {
    setValue("destinationConfig.locationId", "");
    setValue("destinationConfig.userReplicaLocationIds", []);
  };
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
          resetLocations();
        }}
      />
      <Controller
        control={control}
        name="destinationConfig.projectId"
        render={({ field, fieldState: { error } }) => (
          <SyncField
            label="Project"
            tooltip="Requires the Secret Manager, Cloud Resource Manager, and Service Usage APIs, and the right roles on the service account."
            error={error?.message}
          >
            <Combobox
              label="Project"
              value={field.value ?? ""}
              onValueChange={(value) => {
                resetLocations();
                field.onChange(value);
              }}
              options={projects.map((project) => ({
                value: project.id,
                label: project.name,
                meta: project.id
              }))}
              placeholder="Select a GCP project..."
              disabled={!connectionId}
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
      <Controller
        control={control}
        name="destinationConfig.scope"
        render={({ field, fieldState: { error } }) => (
          <SyncField
            label="Scope"
            error={error?.message}
            tooltip={
              <Stack gap={8}>
                {Object.values(GCP_SYNC_SCOPES).map(({ name, description }) => (
                  <span key={name}>
                    {name}: {description}
                  </span>
                ))}
              </Stack>
            }
          >
            <Select
              value={field.value ?? ""}
              onValueChange={(value) => {
                field.onChange(value);
                resetLocations();
              }}
              options={[
                { value: "global", label: "Global" },
                { value: "region", label: "Region" }
              ]}
              placeholder="Select a scope..."
              disabled={!projectId}
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
      {scope === "region" && (
        <Controller
          control={control}
          name="destinationConfig.locationId"
          render={({ field, fieldState: { error } }) => (
            <SyncField label="Region" error={error?.message}>
              <Combobox
                label="Region"
                value={field.value ?? ""}
                onValueChange={field.onChange}
                options={projectId ? locationOptions : []}
                placeholder="Select a region..."
                disabled={!projectId}
                invalid={Boolean(error)}
              />
            </SyncField>
          )}
        />
      )}
      {scope === "global" && (
        <Accordion type="single" collapsible value={openItem} onValueChange={setOpenItem}>
          <AccordionItem value="advanced">
            <AccordionTrigger>Advanced</AccordionTrigger>
            <AccordionContent>
              <Controller
                control={control}
                name="destinationConfig.userReplicaLocationIds"
                render={({ field, fieldState: { error } }) => (
                  <Stack gap={8}>
                    <SyncField
                      label="Replica regions"
                      tooltip="Leave empty to let GCP manage replication."
                      error={error?.message}
                    >
                      <Combobox
                        label="Replica regions"
                        multiple
                        value={(field.value as string[] | undefined) ?? []}
                        onValueChange={field.onChange}
                        options={projectId ? locationOptions : []}
                        placeholder="Automatic replication"
                        disabled={!projectId}
                        invalid={Boolean(error)}
                      />
                    </SyncField>
                    {Boolean(field.value?.length) && (
                      <Alert tone="warn" title="Replica regions can't be changed after creation">
                        GCP does not support changing them. You can still switch the scope to Region
                        later.
                      </Alert>
                    )}
                  </Stack>
                )}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </Stack>
  );
}

function AzureKeyVaultDestination() {
  const { setValue } = useSyncForm();
  return (
    <Stack gap={16}>
      <ConnectionField onChange={() => setValue("destinationConfig.vaultBaseUrl", "")} />
      <TextField
        name="destinationConfig.vaultBaseUrl"
        label="Vault base URL"
        placeholder="https://example.vault.azure.net"
      />
      <Alert tone="info" title="Key naming">
        Underscores (_) in keys become hyphens (-) in Azure Key Vault. Imported secrets keep their
        hyphens.
      </Alert>
    </Stack>
  );
}

const VERCEL_ENVIRONMENTS = [
  { value: "development", label: "Development" },
  { value: "preview", label: "Preview" },
  { value: "production", label: "Production" }
];

function VercelDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, scope, app, env, teamId, targetEnvironments] = useWatch({
    control,
    name: [
      "connection.id",
      "destinationConfig.scope",
      "destinationConfig.app",
      "destinationConfig.env",
      "destinationConfig.teamId",
      "destinationConfig.targetEnvironments"
    ]
  }) as [string | undefined, string, string, string, string, string[] | undefined];
  const teams = useConnectionOptions(useV4Adapter("secrets").useVercelOrganizations);
  const allApps = teams.flatMap((team) =>
    team.apps.map((entry) => ({ ...entry, teamId: team.id, teamName: team.name }))
  );
  const isTeamScope = scope === "team";
  const availableApps = isTeamScope ? allApps.filter((entry) => entry.teamId === teamId) : allApps;
  const selectedProject = allApps.find((entry) => entry.id === app);
  const environmentOptions = [
    ...VERCEL_ENVIRONMENTS,
    ...(selectedProject?.envs?.map((entry) => ({ value: entry.id, label: entry.slug })) ?? [])
  ];
  const isProjectDevTargeted = !isTeamScope && env === "development";
  const isTeamDevTargeted = isTeamScope && Boolean(targetEnvironments?.includes("development"));
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.app", "");
          setValue("destinationConfig.appName", "");
          setValue("destinationConfig.env", "production");
          setValue("destinationConfig.branch", "");
          setValue("destinationConfig.teamId", "");
          setValue("destinationConfig.teamName", "");
          setValue("destinationConfig.scope", "project");
          setValue("destinationConfig.sensitive", false);
        }}
      />
      <Controller
        control={control}
        name="destinationConfig.scope"
        render={({ field, fieldState: { error } }) => (
          <SyncField label="Scope" error={error?.message}>
            <Select
              value={field.value ?? ""}
              onValueChange={(next) => {
                field.onChange(next);
                if (next === "team") {
                  setValue("destinationConfig.teamId", "");
                  setValue("destinationConfig.targetEnvironments", []);
                  setValue("destinationConfig.applyToAllCustomEnvironments", false);
                  setValue("destinationConfig.targetProjects", undefined);
                  setValue("destinationConfig.teamName", "");
                } else {
                  setValue("destinationConfig.app", "");
                  setValue("destinationConfig.appName", "");
                  setValue("destinationConfig.env", "production");
                  setValue("destinationConfig.branch", "");
                  setValue("destinationConfig.teamId", "");
                }
                setValue("destinationConfig.sensitive", false);
              }}
              options={[
                { value: "project", label: "Project" },
                { value: "team", label: "Team" }
              ]}
              placeholder="Select a scope..."
              disabled={!connectionId}
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
      {isTeamScope && (
        <>
          <Controller
            control={control}
            name="destinationConfig.teamId"
            render={({ field, fieldState: { error } }) => (
              <SyncField label="Team" error={error?.message}>
                <Combobox
                  label="Team"
                  value={field.value ?? ""}
                  onValueChange={(id) => {
                    field.onChange(id);
                    setValue(
                      "destinationConfig.teamName",
                      teams.find((team) => team.id === id)?.name ?? ""
                    );
                  }}
                  options={teams.map((team) => ({ value: team.id, label: team.name }))}
                  placeholder="Select a team..."
                  invalid={Boolean(error)}
                />
              </SyncField>
            )}
          />
          <Controller
            control={control}
            name="destinationConfig.targetEnvironments"
            render={({ field, fieldState: { error } }) => (
              <SyncField label="Target environments" error={error?.message}>
                <Combobox
                  label="Target environments"
                  multiple
                  value={(field.value as string[] | undefined) ?? []}
                  onValueChange={field.onChange}
                  options={VERCEL_ENVIRONMENTS}
                  placeholder="Select target environments..."
                  invalid={Boolean(error)}
                />
              </SyncField>
            )}
          />
          <Controller
            control={control}
            name="destinationConfig.targetProjects"
            render={({ field, fieldState: { error } }) => (
              <SyncField label="Target projects" optional error={error?.message}>
                <Combobox
                  label="Target projects"
                  multiple
                  value={(field.value as string[] | undefined) ?? []}
                  onValueChange={field.onChange}
                  options={availableApps.map((entry) => ({ value: entry.id, label: entry.name }))}
                  placeholder="Select target projects..."
                  invalid={Boolean(error)}
                />
              </SyncField>
            )}
          />
          <SwitchField
            name="destinationConfig.applyToAllCustomEnvironments"
            label="Apply to all custom environments"
          />
        </>
      )}
      {!isTeamScope && (
        <>
          <Controller
            control={control}
            name="destinationConfig.app"
            render={({ field, fieldState: { error } }) => (
              <SyncField
                label="Vercel project"
                error={error?.message}
                tooltip={
                  <Stack gap={8}>
                    <span>The connection&apos;s API token scope must include the project.</span>
                    <span>Only 10 projects show by default. Search by name to find others.</span>
                  </Stack>
                }
              >
                <Combobox
                  label="Vercel project"
                  value={field.value ?? ""}
                  onValueChange={(id) => {
                    const selected = availableApps.find((entry) => entry.id === id);
                    if (!selected || id === field.value) return;
                    field.onChange(id);
                    setValue("destinationConfig.env", "production");
                    setValue("destinationConfig.branch", "");
                    setValue("destinationConfig.teamId", selected.teamId);
                    setValue("destinationConfig.teamName", selected.teamName);
                    setValue("destinationConfig.appName", selected.name);
                  }}
                  options={availableApps.map((entry) => ({
                    value: entry.id,
                    label: entry.name,
                    meta: entry.teamName
                  }))}
                  emptyText="No projects found."
                  placeholder="Search for a project..."
                  disabled={!connectionId}
                  invalid={Boolean(error)}
                />
              </SyncField>
            )}
          />
          <Controller
            control={control}
            name="destinationConfig.env"
            render={({ field, fieldState: { error } }) => (
              <SyncField label="Vercel project environment" error={error?.message}>
                <Combobox
                  label="Vercel project environment"
                  value={field.value ?? ""}
                  onValueChange={(value) => {
                    field.onChange(value);
                    setValue("destinationConfig.branch", "");
                    if (value === "development") setValue("destinationConfig.sensitive", false);
                  }}
                  options={environmentOptions}
                  placeholder="Select an environment..."
                  disabled={!connectionId || !app}
                  invalid={Boolean(error)}
                />
              </SyncField>
            )}
          />
          {env === "preview" && (
            <Controller
              control={control}
              name="destinationConfig.branch"
              render={({ field, fieldState: { error } }) => (
                <SyncField label="Vercel preview branch" optional error={error?.message}>
                  <Combobox
                    label="Vercel preview branch"
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                    options={[
                      ...new Set([
                        ...(selectedProject?.previewBranches ?? []),
                        ...(field.value ? [field.value as string] : [])
                      ])
                    ].map((branch) => ({ value: branch, label: branch }))}
                    onCreate={(branch) => field.onChange(branch)}
                    placeholder="Select a branch..."
                    disabled={!connectionId || !app}
                    invalid={Boolean(error)}
                  />
                </SyncField>
              )}
            />
          )}
        </>
      )}
      <Controller
        control={control}
        name="destinationConfig.sensitive"
        render={({ field, fieldState: { error } }) => (
          <Stack gap={8}>
            <Switch
              ref={field.ref}
              layout="row"
              label="Mark secrets as sensitive in Vercel"
              description="Sensitive variables cannot be read back through the Vercel API."
              checked={Boolean(field.value) && !isProjectDevTargeted}
              disabled={isProjectDevTargeted}
              onCheckedChange={(checked) => {
                if (!isProjectDevTargeted) field.onChange(checked);
              }}
            />
            {error?.message && <FieldDescription>{error.message}</FieldDescription>}
            {(isProjectDevTargeted || (isTeamDevTargeted && Boolean(field.value))) && (
              <Alert tone="warn" title="Sensitive not supported for Development">
                Vercel does not allow sensitive variables in development environments.
                {isTeamDevTargeted &&
                  Boolean(field.value) &&
                  " They apply only to your other selected environments."}
              </Alert>
            )}
          </Stack>
        )}
      />
    </Stack>
  );
}

function AwsTagsEditor() {
  const { control } = useSyncForm();
  const tags = useFieldArray({ control, name: "syncOptions.tags" });
  return (
    <Stack gap={12}>
      <div className={styles.tagGrid}>
        <span className={styles.tagHead}>Key</span>
        <span className={styles.tagHead}>Value (optional)</span>
        <span />
        {tags.fields.map((entry, index) => (
          <div key={entry.id} className={styles.tagRow}>
            <Controller
              control={control}
              name={`syncOptions.tags.${index}.key`}
              render={({ field, fieldState: { error } }) => (
                <Input
                  ref={field.ref}
                  aria-label={`Tag ${index + 1} key`}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={Boolean(error)}
                  title={error?.message}
                />
              )}
            />
            <Controller
              control={control}
              name={`syncOptions.tags.${index}.value`}
              render={({ field, fieldState: { error } }) => (
                <Input
                  ref={field.ref}
                  aria-label={`Tag ${index + 1} value`}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={Boolean(error)}
                  title={error?.message}
                />
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              icon="trash"
              iconOnly
              aria-label={`Remove tag ${index + 1}`}
              disabled={tags.fields.length <= 1}
              onClick={() => tags.remove(index)}
            />
          </div>
        ))}
      </div>
      <span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          icon="plus"
          onClick={() => tags.append({ key: "", value: "" })}
        >
          Add tag
        </Button>
      </span>
    </Stack>
  );
}

function AwsAdvancedOptions({ destination }: { destination: SecretSync }) {
  const { control, setValue, formState } = useSyncForm();
  const isSecretsManager = destination === SecretSync.AWSSecretsManager;
  const [connectionId, region, mappingBehavior, tags, keyId, metadataAsTags] = useWatch({
    control,
    name: [
      "connection.id",
      "destinationConfig.region",
      "destinationConfig.mappingBehavior",
      "syncOptions.tags",
      "syncOptions.keyId",
      "syncOptions.syncSecretMetadataAsTags"
    ]
  }) as [string | undefined, string, string, unknown, string | undefined, boolean | undefined];
  const showMetadataAsTags = !isSecretsManager || mappingBehavior === "one-to-one";
  const metadataActive = showMetadataAsTags && Boolean(metadataAsTags);
  const hasTags = Array.isArray(tags);
  const hasError = Boolean(
    (formState.errors.syncOptions as Record<string, unknown> | undefined)?.tags ||
    (formState.errors.syncOptions as Record<string, unknown> | undefined)?.keyId
  );
  const [openItem, setOpenItem] = useState(
    keyId || hasTags || metadataActive || hasError ? "advanced" : ""
  );
  const summary =
    [
      keyId ? "Custom KMS key" : null,
      metadataActive ? "Sync metadata as tags" : null,
      hasTags ? "Resource tags" : null
    ]
      .filter(Boolean)
      .join(", ") || "All defaults";
  const defaultAlias = isSecretsManager ? "alias/aws/secretsmanager" : "alias/aws/ssm";
  const keys = (
    useV4Adapter("secrets").useAwsKmsKeys(
      {
        connectionId: connectionId ?? "",
        region,
        destination: destination as SecretSync.AWSParameterStore | SecretSync.AWSSecretsManager
      },
      { enabled: Boolean(connectionId && region) }
    ).data ?? []
  ).map((key) => key.alias);
  const kmsPermissions = (
    <>
      Custom keys require <code>kms:ListAliases</code>, <code>kms:DescribeKey</code>,{" "}
      <code>kms:Encrypt</code>, and <code>kms:Decrypt</code> on the selected IAM role.
    </>
  );
  return (
    <Accordion
      type="single"
      collapsible
      value={hasError ? "advanced" : openItem}
      onValueChange={setOpenItem}
    >
      <AccordionItem value="advanced">
        <AccordionTrigger>
          <span className={styles.accordionTitle}>
            <span>Advanced options</span>
            <span className={styles.accordionSummary}>{summary}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <Stack gap={16}>
            <Controller
              control={control}
              name="syncOptions.keyId"
              render={({ field, fieldState: { error } }) => (
                <SyncField label="KMS key" description={kmsPermissions} error={error?.message}>
                  <Combobox
                    label="KMS key"
                    value={field.value ?? ""}
                    onValueChange={(value) => field.onChange(value || undefined)}
                    options={keys.map((alias) => ({
                      value: alias,
                      label: alias === defaultAlias ? `${alias} (Default)` : alias
                    }))}
                    emptyText="No KMS keys found."
                    placeholder="Leave blank to use default KMS key"
                    disabled={!connectionId}
                    invalid={Boolean(error)}
                  />
                </SyncField>
              )}
            />
            {showMetadataAsTags && (
              <SwitchField
                name="syncOptions.syncSecretMetadataAsTags"
                label="Sync secret metadata as resource tags"
                description="Manually configured tags win when keys conflict."
              />
            )}
            <Stack gap={12}>
              <Switch
                layout="row"
                label="Configure resource tags"
                description={`Applied to every synced ${isSecretsManager ? "secret" : "parameter"}, overwriting existing AWS resource tags.`}
                checked={hasTags}
                onCheckedChange={(checked) =>
                  setValue("syncOptions.tags", checked ? [{ key: "", value: "" }] : undefined, {
                    shouldDirty: true
                  })
                }
              />
              {hasTags && <AwsTagsEditor />}
            </Stack>
          </Stack>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function AzureKeyVaultOptions() {
  return (
    <SwitchField
      name="syncOptions.disableCertificateImport"
      label="Disable certificate import"
      description="Skips certificate objects that Azure Key Vault exposes through its secrets API."
    />
  );
}

const regionValue = (slug: string) => {
  const region = AWS_REGIONS.find((entry) => entry.slug === slug);
  return (
    <span className={styles.inlineValue}>
      {region?.name}
      <Badge tone="ok" mono>
        {region?.slug ?? slug}
      </Badge>
    </span>
  );
};

function TagsReviewValue({ tags }: { tags: { key: string; value: string }[] }) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button type="button" className={styles.hoverTrigger}>
          <Badge tone="soft">
            <Icon name="eye" />
            {tags.length} tag{tags.length > 1 ? "s" : ""}
          </Badge>
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="right" className={styles.tagsCard}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags.map((tag) => (
              <TableRow key={tag.key}>
                <TableCell>{tag.key}</TableCell>
                <TableCell>{tag.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </HoverCardContent>
    </HoverCard>
  );
}

const awsOptionsReview = (options: FieldValues, tagsLabel: string): ReviewItems => {
  const tags = <TagsReviewValue tags={options.tags} />;
  const enabled = <Badge tone="ok">Enabled</Badge>;
  return [
    ...(options.keyId ? [["KMS key", options.keyId] as const] : []),
    ...(options.tags?.length ? [[tagsLabel, tags] as const] : []),
    ...(options.syncSecretMetadataAsTags
      ? [["Sync secret metadata as resource tags", enabled] as const]
      : [])
  ];
};

const githubReview = (config: FieldValues): ReviewItems => {
  const scopeLabel = GITHUB_SCOPES.find((entry) => entry.value === config.scope)?.label;
  if (config.scope === "organization")
    return [
      ["Scope", scopeLabel],
      ["Organization", config.org],
      ["Visibility", GITHUB_VISIBILITY.find((entry) => entry.value === config.visibility)?.label]
    ];
  return [
    ["Scope", scopeLabel],
    ["Repository", `${config.owner}/${config.repo}`],
    ...(config.scope === "repository-environment" ? [["Environment", config.env] as const] : [])
  ];
};

const gcpReview = (config: FieldValues): ReviewItems => [
  ["Project ID", config.projectId],
  ["Scope", config.scope === "region" ? "Region" : "Global"],
  ...(config.scope === "region" ? [["Region", config.locationId] as const] : []),
  ...(config.scope === "global" && config.userReplicaLocationIds?.length
    ? [["Replica regions", config.userReplicaLocationIds.join(", ")] as const]
    : [])
];

function VercelProjectNames({ teamId, ids }: { teamId: string; ids: string[] }) {
  const team = useConnectionOptions(useV4Adapter("secrets").useVercelOrganizations).find(
    (entry) => entry.id === teamId
  );
  return ids.map((id) => team?.apps.find((entry) => entry.id === id)?.name ?? id).join(", ");
}

const vercelReview = (config: FieldValues): ReviewItems => {
  if (config.scope === "team") {
    return [
      ["Scope", "Team"],
      ["Vercel team", config.teamName],
      [
        "Target environments",
        (config.targetEnvironments as string[] | undefined)
          ?.map((env) => env.charAt(0).toUpperCase() + env.slice(1))
          .join(", ")
      ],
      ["All custom environments", yesNo(config.applyToAllCustomEnvironments)],
      [
        "Target projects",
        <VercelProjectNames
          teamId={config.teamId}
          ids={(config.targetProjects as string[] | undefined) ?? []}
        />
      ],
      ["Sensitive", yesNo(config.sensitive)]
    ];
  }
  return [
    ["Scope", "Project"],
    ["Vercel project", config.appName],
    ["Environment", config.env],
    ...(config.env === "preview" && config.branch
      ? [["Preview branch", config.branch] as const]
      : []),
    ["Sensitive", yesNo(config.sensitive)]
  ];
};

export const CORE_SYNC_VIEWS: Record<
  | SecretSync.AWSParameterStore
  | SecretSync.AWSSecretsManager
  | SecretSync.GitHub
  | SecretSync.GCPSecretManager
  | SecretSync.AzureKeyVault
  | SecretSync.Vercel,
  SyncView
> = {
  [SecretSync.AWSParameterStore]: {
    Destination: AwsParameterStoreDestination,
    Options: () => <AwsAdvancedOptions destination={SecretSync.AWSParameterStore} />,
    defaults: {},
    destinationReview: (config) => [
      ["Region", regionValue(config.region)],
      ["Path", config.path]
    ],
    optionsReview: (options) => awsOptionsReview(options, "Resource tags")
  },
  [SecretSync.AWSSecretsManager]: {
    Destination: AwsSecretsManagerDestination,
    Options: () => <AwsAdvancedOptions destination={SecretSync.AWSSecretsManager} />,
    defaults: { destinationConfig: { mappingBehavior: "one-to-one" } },
    destinationReview: (config) => [
      ["Region", regionValue(config.region)],
      ["Mapping behavior", config.mappingBehavior === "many-to-one" ? "Many-to-one" : "One-to-one"],
      ...(config.mappingBehavior === "many-to-one"
        ? [["Secret name", config.secretName] as const]
        : [])
    ],
    optionsReview: (options) => awsOptionsReview(options, "Tags")
  },
  [SecretSync.GitHub]: {
    Destination: GitHubDestination,
    defaults: { destinationConfig: { scope: "repository", owner: "", repo: "" } },
    destinationReview: githubReview
  },
  [SecretSync.GCPSecretManager]: {
    Destination: GcpDestination,
    defaults: { destinationConfig: { scope: "global", projectId: "", userReplicaLocationIds: [] } },
    destinationReview: gcpReview
  },
  [SecretSync.AzureKeyVault]: {
    Destination: AzureKeyVaultDestination,
    Options: AzureKeyVaultOptions,
    defaults: {
      destinationConfig: { vaultBaseUrl: "" },
      syncOptions: { disableCertificateImport: false }
    },
    destinationReview: (config) => [["Vault URL", config.vaultBaseUrl]]
  },
  [SecretSync.Vercel]: {
    Destination: VercelDestination,
    defaults: {
      destinationConfig: {
        scope: "project",
        app: "",
        appName: "",
        env: "production",
        branch: "",
        teamId: "",
        sensitive: false
      }
    },
    destinationReview: vercelReview
  }
};
