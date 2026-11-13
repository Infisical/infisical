import { type ComponentProps, useEffect, useState } from "react";
import { Controller, useFieldArray, useWatch } from "react-hook-form";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Code } from "@infisical/cipher/ui/code";
import { Combobox, type ComboboxOption } from "@infisical/cipher/ui/combobox";
import { FieldError, FieldLegend, FieldSet } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Grid, Inline, Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@infisical/cipher/ui/tabs";
import { SmallText } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";

import type { TCloudflarePermissionGroup } from "@app/hooks/api/appConnections/cloudflare/types";

import { useV4Adapter } from "../../../../../../data/adapters";
import {
  InfoTip,
  ReviewSection,
  RotationField,
  type RotationViews,
  SecretsMappingFields,
  SelectField,
  TextField,
  useConnectionId,
  useConnectionOptions,
  useRotationForm
} from "../fields";
import { ROTATION_TEMPLATES } from "../model";
import {
  CLOUDFLARE_POLICY_EFFECT_MAP,
  CLOUDFLARE_POLICY_SCOPE_MAP,
  CLOUDFLARE_POLICY_SCOPE_RESOURCE_MAP,
  CLOUDFLARE_R2_ACCESS_LEVEL_MAP,
  CLOUDFLARE_R2_JURISDICTION_MAP,
  CLOUDFLARE_TOKEN_NAME_MAX_LENGTH,
  CloudflareApiTokenPolicyEffect,
  CloudflareApiTokenPolicyScope,
  CloudflareR2AccessLevel,
  getR2BucketLabel,
  OpenRouterLimitReset,
  r2BucketKey,
  SecretRotation,
  type TCloudflareApiTokenPolicyRow,
  type TCloudflareR2BucketSelection
} from "../schemas";
import { StripePermissionSelector } from "./cloud-stripe";

const toOptions = (map: Record<string, string>) =>
  Object.entries(map).map(([value, label]) => ({ value, label }));

const asOptions = (items: { id: string; name: string }[]): ComboboxOption[] =>
  items.map(({ id, name }) => ({ value: id, label: name }));

function PickerField({
  name,
  label,
  tooltip,
  optional,
  description,
  placeholder,
  options,
  multiple,
  disabled
}: {
  name: string;
  label: string;
  tooltip?: string;
  optional?: boolean;
  description?: string;
  placeholder: string;
  options: ComboboxOption[];
  multiple?: boolean;
  disabled?: boolean;
}) {
  const { control } = useRotationForm();
  const connectionId = useConnectionId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <RotationField
          label={label}
          tooltip={tooltip}
          optional={optional}
          description={description}
          error={error?.message}
        >
          {multiple ? (
            <Combobox
              ref={field.ref}
              multiple
              label={label}
              value={field.value ?? []}
              onValueChange={field.onChange}
              options={options}
              placeholder={placeholder}
              disabled={!connectionId || disabled}
              invalid={Boolean(error)}
            />
          ) : (
            <Combobox
              ref={field.ref}
              label={label}
              value={field.value ?? ""}
              onValueChange={(value) => field.onChange(value || undefined)}
              options={options}
              placeholder={placeholder}
              disabled={!connectionId || disabled}
              invalid={Boolean(error)}
            />
          )}
        </RotationField>
      )}
    />
  );
}

function IpListInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Textarea>, "value" | "onChange"> & {
  value?: string[];
  onChange: (value: string[]) => void;
}) {
  const [rawValue, setRawValue] = useState((value ?? []).join("\n"));
  return (
    <Textarea
      {...props}
      rows={4}
      value={rawValue}
      onChange={(event) => {
        setRawValue(event.target.value);
        onChange(
          event.target.value
            .split(/[\n,]/)
            .map((entry) => entry.trim())
            .filter(Boolean)
        );
      }}
      placeholder={"199.27.128.0/21\n2400:cb00::/32"}
    />
  );
}

function IpListField({ name, label, tooltip }: { name: string; label: string; tooltip: string }) {
  const { control } = useRotationForm();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <RotationField label={label} tooltip={tooltip} optional error={error?.message}>
          <IpListInput value={field.value} onChange={field.onChange} />
        </RotationField>
      )}
    />
  );
}

const DEFAULT_POLICY: TCloudflareApiTokenPolicyRow = {
  effect: CloudflareApiTokenPolicyEffect.Allow,
  scope: CloudflareApiTokenPolicyScope.Account,
  zoneIds: [],
  permissionGroupId: ""
};

const permissionGroupOptionsFor = (
  groups: TCloudflarePermissionGroup[],
  scope: CloudflareApiTokenPolicyScope
) =>
  asOptions(
    groups.filter(
      (group) =>
        !group.scopes.length || group.scopes.includes(CLOUDFLARE_POLICY_SCOPE_RESOURCE_MAP[scope])
    )
  );

function CloudflareApiTokenParameters() {
  const { control, getValues, setValue } = useRotationForm();
  const adapter = useV4Adapter("secrets");
  const zones = useConnectionOptions(adapter.useCloudflareAccountZones);
  const permissionGroups = useConnectionOptions(adapter.useCloudflarePermissionGroups);
  const policies = useWatch({ control, name: "parameters.policies" }) as
    | TCloudflareApiTokenPolicyRow[]
    | undefined;
  const policyFields = useFieldArray({ control, name: "parameters.policies" });

  useEffect(() => {
    if (!getValues("parameters.policies")?.length) {
      setValue("parameters.policies", [DEFAULT_POLICY]);
    }
  }, [getValues, setValue]);

  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="restrictions">Restrictions</TabsTrigger>
      </TabsList>
      <TabsContent value="general">
        <Stack gap={16}>
          <TextField
            name="parameters.name"
            label="Token Name"
            tooltip="The name for the generated Cloudflare API token. A timestamp is appended so each rotated token is distinct."
            placeholder="infisical-rotated-token"
            maxLength={CLOUDFLARE_TOKEN_NAME_MAX_LENGTH}
          />
          <FieldSet>
            <Inline gap={4} wrap={false}>
              <FieldLegend variant="label">Access Policies</FieldLegend>
              <InfoTip content="Each row grants one permission group over the entire account, all zones in the account, or a specific set of zones. Rows targeting the same resources are combined into a single Cloudflare policy." />
            </Inline>
            <Stack gap={12}>
              {policyFields.fields.map(({ id }, i) => {
                const scope = policies?.[i]?.scope ?? CloudflareApiTokenPolicyScope.Account;
                const showZones = scope === CloudflareApiTokenPolicyScope.Zones;
                return (
                  <Card
                    key={id}
                    size="sm"
                    title={`Policy ${i + 1}`}
                    action={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Delete policy"
                        onClick={() => {
                          const current = getValues("parameters.policies");
                          if (current && current.length > 1) {
                            policyFields.remove(i);
                          } else {
                            setValue("parameters.policies", [DEFAULT_POLICY]);
                          }
                        }}
                      >
                        <Icon name="trash" />
                      </Button>
                    }
                  >
                    <Grid columns={2} gap={12}>
                      <SelectField
                        name={`parameters.policies.${i}.effect`}
                        label="Effect"
                        options={toOptions(CLOUDFLARE_POLICY_EFFECT_MAP)}
                      />
                      <Controller
                        control={control}
                        name={`parameters.policies.${i}.scope`}
                        render={({ field, fieldState: { error } }) => (
                          <RotationField label="Scope" error={error?.message}>
                            <Select
                              value={field.value}
                              onValueChange={(next) => {
                                if (!next || next === field.value) return;
                                field.onChange(next);
                                setValue(`parameters.policies.${i}.zoneIds`, []);
                                setValue(`parameters.policies.${i}.permissionGroupId`, "");
                              }}
                              options={toOptions(CLOUDFLARE_POLICY_SCOPE_MAP)}
                              invalid={Boolean(error)}
                            />
                          </RotationField>
                        )}
                      />
                      {showZones && (
                        <PickerField
                          multiple
                          name={`parameters.policies.${i}.zoneIds`}
                          label="Zones"
                          placeholder="Select zones..."
                          options={asOptions(zones)}
                        />
                      )}
                      <div className={showZones ? undefined : "col-span-2"}>
                        <PickerField
                          name={`parameters.policies.${i}.permissionGroupId`}
                          label="Permission group"
                          placeholder="Select a permission group..."
                          options={permissionGroupOptionsFor(permissionGroups, scope)}
                        />
                      </div>
                    </Grid>
                  </Card>
                );
              })}
              <div>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  icon="plus"
                  onClick={() => policyFields.append(DEFAULT_POLICY)}
                >
                  Add policy
                </Button>
              </div>
            </Stack>
          </FieldSet>
        </Stack>
      </TabsContent>
      <TabsContent value="restrictions">
        <Stack gap={16}>
          <IpListField
            name="parameters.allowedIps"
            label="Allowed IPs"
            tooltip="The generated token can only be used from these IP addresses or CIDR blocks. One entry per line. Leave empty to allow any IP."
          />
          <IpListField
            name="parameters.disallowedIps"
            label="Disallowed IPs"
            tooltip="The generated token cannot be used from these IP addresses or CIDR blocks. One entry per line."
          />
        </Stack>
      </TabsContent>
    </Tabs>
  );
}

function CloudflareR2AccessKeyParameters() {
  const { control } = useRotationForm();
  const connectionId = useConnectionId();
  const fetchedBuckets = useConnectionOptions(useV4Adapter("secrets").useCloudflareR2Buckets);
  const selectedBuckets = useWatch({ control, name: "parameters.buckets" }) as
    | TCloudflareR2BucketSelection[]
    | undefined;
  const fetchedKeys = new Set(fetchedBuckets.map(r2BucketKey));
  const buckets = [
    ...fetchedBuckets,
    ...(selectedBuckets ?? []).filter((bucket) => !fetchedKeys.has(r2BucketKey(bucket)))
  ];
  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="restrictions">Restrictions</TabsTrigger>
      </TabsList>
      <TabsContent value="general">
        <Stack gap={16}>
          <TextField
            name="parameters.name"
            label="Token Name"
            tooltip="The name for the generated Cloudflare API token that backs the access key. A timestamp is appended so each rotated key is distinct."
            placeholder="infisical-r2-access-key"
            maxLength={CLOUDFLARE_TOKEN_NAME_MAX_LENGTH}
          />
          <Controller
            control={control}
            name="parameters.buckets"
            render={({ field, fieldState: { error } }) => (
              <RotationField
                label="Buckets"
                tooltip="The R2 buckets the generated access key can act on. Buckets are granted by name, so renaming one in Cloudflare requires updating this rotation."
                error={error?.message}
              >
                <Combobox
                  ref={field.ref}
                  multiple
                  label="Buckets"
                  value={((field.value ?? []) as TCloudflareR2BucketSelection[]).map(r2BucketKey)}
                  onValueChange={(keys) =>
                    field.onChange(
                      keys
                        .map((key) => buckets.find((bucket) => r2BucketKey(bucket) === key))
                        .filter(Boolean)
                    )
                  }
                  options={buckets.map((bucket) => ({
                    value: r2BucketKey(bucket),
                    label: bucket.name,
                    meta: CLOUDFLARE_R2_JURISDICTION_MAP[bucket.jurisdiction]
                  }))}
                  placeholder="Select buckets..."
                  disabled={!connectionId}
                  invalid={Boolean(error)}
                />
              </RotationField>
            )}
          />
          <SelectField
            name="parameters.accessLevel"
            label="Access Level"
            tooltip="What the generated key can do on the selected buckets. Read only allows get and list; Read & Write also allows put and delete."
            options={toOptions(CLOUDFLARE_R2_ACCESS_LEVEL_MAP)}
            defaultValue={CloudflareR2AccessLevel.ObjectRead}
          />
        </Stack>
      </TabsContent>
      <TabsContent value="restrictions">
        <Stack gap={16}>
          <IpListField
            name="parameters.allowedIps"
            label="Allowed IPs"
            tooltip="The generated access key can only be used from these IP addresses or CIDR blocks. One entry per line. Leave empty to allow any IP."
          />
          <IpListField
            name="parameters.disallowedIps"
            label="Disallowed IPs"
            tooltip="The generated access key cannot be used from these IP addresses or CIDR blocks. One entry per line."
          />
        </Stack>
      </TabsContent>
    </Tabs>
  );
}

function StripeApiKeyParameters() {
  const { control } = useRotationForm();
  return (
    <>
      <TextField
        name="parameters.keyName"
        label="Key Name"
        tooltip="Optional. The name of each key this rotation creates in Stripe. Infisical adds a timestamp to each name so you can tell the old and new key apart. If empty, the name is infisical-managed."
        placeholder="e.g. payments-service"
      />
      <Controller
        control={control}
        name="parameters.permissions"
        render={({ field, fieldState: { error } }) => (
          <Stack gap={4}>
            <StripePermissionSelector value={field.value ?? []} onChange={field.onChange} />
            {error?.message && <FieldError>{error.message}</FieldError>}
          </Stack>
        )}
      />
    </>
  );
}

const LITELLM_API_KEY_NAME_MAX_LENGTH = 100;

const DEFAULT_LITELLM_OPTIONS = `{
  "max_budget": null,
  "tpm_limit": null,
  "rpm_limit": null,
  "metadata": {}
}`;

function LiteLLMApiKeyParameters() {
  const adapter = useV4Adapter("secrets");
  const users = useConnectionOptions(adapter.useLiteLLMUsers);
  const teams = useConnectionOptions(adapter.useLiteLLMTeams);
  const models = useConnectionOptions(adapter.useLiteLLMModels);
  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="advanced">Advanced</TabsTrigger>
      </TabsList>
      <TabsContent value="general">
        <Stack gap={16}>
          <TextField
            name="parameters.name"
            label="Key Name"
            tooltip="A descriptive name for the generated key. Infisical appends a timestamp so each rotated key stays unique and records its creation time."
            placeholder="my-rotated-key"
            maxLength={LITELLM_API_KEY_NAME_MAX_LENGTH}
          />
          <PickerField
            name="parameters.userId"
            label="User"
            optional
            tooltip="Associate the generated key with a LiteLLM user. Search by email."
            placeholder="Search for a user..."
            options={asOptions(users)}
          />
          <PickerField
            name="parameters.teamId"
            label="Team"
            optional
            tooltip="Associate the generated key with a LiteLLM team. Search by team alias."
            placeholder="Search for a team..."
            options={asOptions(teams)}
          />
          <PickerField
            multiple
            name="parameters.models"
            label="Models"
            optional
            tooltip="Restrict the generated key to specific models. Leave empty to allow all models."
            placeholder="Select models..."
            options={asOptions(models)}
          />
        </Stack>
      </TabsContent>
      <TabsContent value="advanced">
        <Stack gap={16}>
          <TextField
            name="parameters.additionalOptions"
            label="Additional Key Options (JSON)"
            optional
            tooltip="Common fields: max_budget (number), tpm_limit / rpm_limit (numbers), metadata (object). user_id, team_id and models are set on the general tab; key_alias, auto_rotate, rotation_interval, duration, send_invite_email and key_type are managed by Infisical and cannot be set here."
            placeholder={DEFAULT_LITELLM_OPTIONS}
            defaultValue={DEFAULT_LITELLM_OPTIONS}
            multiline
            rows={10}
          />
        </Stack>
      </TabsContent>
    </Tabs>
  );
}

const OPEN_ROUTER_API_KEY_NAME_MAX_LENGTH = 100;
const NO_RESET_VALUE = "none";

const LIMIT_RESET_OPTIONS = [
  { label: "No Reset", value: NO_RESET_VALUE },
  { label: "Daily", value: OpenRouterLimitReset.Daily },
  { label: "Weekly", value: OpenRouterLimitReset.Weekly },
  { label: "Monthly", value: OpenRouterLimitReset.Monthly }
];

function OpenRouterApiKeyParameters() {
  const { control } = useRotationForm();
  const workspaces = useConnectionOptions(useV4Adapter("secrets").useOpenRouterWorkspaces);
  const [limit, id] = useWatch({ control, name: ["parameters.limit", "id"] });
  const isUpdate = Boolean(id);
  return (
    <>
      <PickerField
        name="parameters.workspaceId"
        label="Workspace"
        optional
        tooltip="The OpenRouter workspace to create API keys in. Leave blank to use your OpenRouter Default workspace. This cannot be changed after the rotation is created."
        description={isUpdate ? "Cannot be updated." : undefined}
        placeholder="Select a workspace..."
        options={asOptions(workspaces)}
        disabled={isUpdate}
      />
      <TextField
        name="parameters.name"
        label="Key Name"
        tooltip="A descriptive name for the generated API key"
        placeholder="My Rotated API Key"
        maxLength={OPEN_ROUTER_API_KEY_NAME_MAX_LENGTH}
      />
      <Controller
        control={control}
        name="parameters.limit"
        render={({ field, fieldState: { error } }) => (
          <RotationField
            label="Credit Limit (USD)"
            optional
            tooltip="Optional spending limit in USD for the generated API key"
            error={error?.message}
          >
            <Input
              ref={field.ref}
              name={field.name}
              type="number"
              value={field.value ?? ""}
              onBlur={field.onBlur}
              onChange={(event) => {
                const { value } = event.target;
                field.onChange(value === "" ? null : Number(value));
              }}
              placeholder="Leave blank for unlimited"
              invalid={Boolean(error)}
            />
          </RotationField>
        )}
      />
      <Controller
        control={control}
        name="parameters.limitReset"
        render={({ field, fieldState: { error } }) => (
          <RotationField
            label="Reset Limit Every"
            optional
            tooltip="How often the spending limit resets (daily, weekly, or monthly). Resets happen at midnight UTC."
            error={error?.message}
          >
            <Select
              disabled={!limit}
              value={field.value ?? NO_RESET_VALUE}
              onValueChange={(value) => field.onChange(value === NO_RESET_VALUE ? null : value)}
              options={LIMIT_RESET_OPTIONS}
              invalid={Boolean(error)}
            />
          </RotationField>
        )}
      />
      <Controller
        control={control}
        name="parameters.includeByokInLimit"
        render={({ field }) => (
          <Switch
            ref={field.ref}
            label="Include BYOK"
            description={
              field.value
                ? "BYOK usage counts toward this key's spending limit."
                : "Only OpenRouter credits count toward the limit."
            }
            layout="row"
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
          />
        )}
      />
    </>
  );
}

const apiKeyMappings = (type: SecretRotation) =>
  function ApiKeyMappings() {
    return (
      <SecretsMappingFields
        items={[
          {
            name: "API Key",
            key: "apiKey",
            placeholder: ROTATION_TEMPLATES[type].secretsMapping.apiKey
          }
        ]}
      />
    );
  };

function CloudflareApiTokenMappings() {
  const { secretsMapping } = ROTATION_TEMPLATES[SecretRotation.CloudflareApiToken];
  return (
    <SecretsMappingFields
      items={[
        { name: "Token ID", key: "tokenId", placeholder: secretsMapping.tokenId },
        { name: "API Token", key: "apiToken", placeholder: secretsMapping.apiToken }
      ]}
    />
  );
}

function CloudflareR2AccessKeyMappings() {
  const { secretsMapping } = ROTATION_TEMPLATES[SecretRotation.CloudflareR2AccessKey];
  return (
    <SecretsMappingFields
      items={[
        { name: "Access Key ID", key: "accessKeyId", placeholder: secretsMapping.accessKeyId },
        {
          name: "Secret Access Key",
          key: "secretAccessKey",
          placeholder: secretsMapping.secretAccessKey
        }
      ]}
    />
  );
}

const useReviewValues = () => {
  const { control } = useRotationForm();
  const [parameters, mapping] = useWatch({ control, name: ["parameters", "secretsMapping"] });
  return {
    parameters: (parameters ?? {}) as Record<string, unknown>,
    mapping: (mapping ?? {}) as Record<string, string | undefined>
  };
};

const ipListItems = (parameters: Record<string, unknown>) => {
  const allowedIps = parameters.allowedIps as string[] | undefined;
  const disallowedIps = parameters.disallowedIps as string[] | undefined;
  return [
    ...(allowedIps?.length ? [["Allowed IPs", allowedIps.join(", ")] as const] : []),
    ...(disallowedIps?.length ? [["Disallowed IPs", disallowedIps.join(", ")] as const] : [])
  ];
};

function CloudflareApiTokenReview() {
  const { parameters, mapping } = useReviewValues();
  const adapter = useV4Adapter("secrets");
  const zones = useConnectionOptions(adapter.useCloudflareAccountZones);
  const permissionGroups = useConnectionOptions(adapter.useCloudflarePermissionGroups);
  const policies = (parameters.policies ?? []) as TCloudflareApiTokenPolicyRow[];
  const scopeLabel = ({ scope, zoneIds }: TCloudflareApiTokenPolicyRow) =>
    scope !== CloudflareApiTokenPolicyScope.Zones
      ? CLOUDFLARE_POLICY_SCOPE_MAP[scope]
      : (zoneIds ?? [])
          .map((zoneId) => zones.find((zone) => zone.id === zoneId)?.name ?? zoneId)
          .join(", ");
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[
          ["Token Name", parameters.name as string],
          ...policies.map(
            (policy, i) =>
              [
                `Policy ${i + 1}`,
                <Inline key={`policy-${i + 1}`} gap={8}>
                  <span>{CLOUDFLARE_POLICY_EFFECT_MAP[policy.effect]}</span>
                  <Badge tone="soft">{scopeLabel(policy)}</Badge>
                  <SmallText muted>
                    {permissionGroups.find((group) => group.id === policy.permissionGroupId)
                      ?.name ?? policy.permissionGroupId}
                  </SmallText>
                </Inline>
              ] as const
          ),
          ...ipListItems(parameters)
        ]}
      />
      <ReviewSection
        label="Secrets Mapping"
        items={[
          ["Token ID", mapping.tokenId],
          ["API Token", mapping.apiToken]
        ]}
      />
    </>
  );
}

function CloudflareR2AccessKeyReview() {
  const { parameters, mapping } = useReviewValues();
  const buckets = (parameters.buckets ?? []) as TCloudflareR2BucketSelection[];
  const accessLevel = parameters.accessLevel as CloudflareR2AccessLevel | undefined;
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[
          ["Token Name", parameters.name as string],
          [
            "Buckets",
            buckets.length ? (
              <Inline gap={8}>
                {buckets.map((bucket) => (
                  <Badge key={r2BucketKey(bucket)} tone="soft">
                    {getR2BucketLabel(bucket)}
                  </Badge>
                ))}
              </Inline>
            ) : undefined
          ],
          ["Access Level", accessLevel && CLOUDFLARE_R2_ACCESS_LEVEL_MAP[accessLevel]],
          ...ipListItems(parameters)
        ]}
      />
      <ReviewSection
        label="Secrets Mapping"
        items={[
          ["Access Key ID", mapping.accessKeyId],
          ["Secret Access Key", mapping.secretAccessKey]
        ]}
      />
    </>
  );
}

const MAX_PERMISSIONS_PREVIEW = 5;

const summarizePermissions = (permissions: string[]) => {
  const preview = permissions.slice(0, MAX_PERMISSIONS_PREVIEW).join(", ");
  const remaining = permissions.length - MAX_PERMISSIONS_PREVIEW;
  return remaining > 0
    ? `${permissions.length} selected: ${preview}, +${remaining} more`
    : `${permissions.length} selected: ${preview}`;
};

function StripeApiKeyReview() {
  const { parameters, mapping } = useReviewValues();
  const keyName = parameters.keyName as string | undefined;
  const permissions = (parameters.permissions ?? []) as string[];
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[
          ...(keyName ? [["Key Name", keyName] as const] : []),
          ...(permissions.length
            ? [["Permissions", summarizePermissions(permissions)] as const]
            : [])
        ]}
      />
      <ReviewSection label="Secrets Mapping" items={[["API Key", mapping.apiKey]]} />
    </>
  );
}

function LiteLLMApiKeyReview() {
  const { parameters, mapping } = useReviewValues();
  const userId = parameters.userId as string | undefined;
  const teamId = parameters.teamId as string | undefined;
  const models = parameters.models as string[] | undefined;
  const additionalOptions = parameters.additionalOptions as string | undefined;
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[
          ["Key Name", parameters.name as string],
          ...(userId ? [["User", userId] as const] : []),
          ...(teamId ? [["Team", teamId] as const] : []),
          ...(models?.length ? [["Models", models.join(", ")] as const] : []),
          [
            "Additional Options",
            additionalOptions ? (
              <Code block format="plain" wrap maxHeight={160}>
                {additionalOptions}
              </Code>
            ) : undefined
          ]
        ]}
      />
      <ReviewSection label="Secrets Mapping" items={[["API Key", mapping.apiKey]]} />
    </>
  );
}

const LIMIT_RESET_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly"
};

function OpenRouterApiKeyReview() {
  const { parameters, mapping } = useReviewValues();
  const workspaceId = parameters.workspaceId as string | undefined;
  const limit = parameters.limit as number | null | undefined;
  const limitReset = parameters.limitReset as string | null | undefined;
  const includeByokInLimit = parameters.includeByokInLimit as boolean | null | undefined;
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[
          ["Key Name", parameters.name as string],
          ...(workspaceId ? [["Workspace ID", workspaceId] as const] : []),
          ...(limit != null ? [["Credit Limit", `$${limit} USD`] as const] : []),
          ...(limitReset
            ? [["Reset Limit", LIMIT_RESET_LABELS[limitReset] || limitReset] as const]
            : []),
          ...(includeByokInLimit != null
            ? [["Include BYOK in limit", includeByokInLimit ? "Yes" : "No"] as const]
            : [])
        ]}
      />
      <ReviewSection label="Secrets Mapping" items={[["API Key", mapping.apiKey]]} />
    </>
  );
}

export const cloudRotationViews = {
  [SecretRotation.CloudflareApiToken]: {
    Parameters: CloudflareApiTokenParameters,
    Mappings: CloudflareApiTokenMappings,
    Review: CloudflareApiTokenReview
  },
  [SecretRotation.CloudflareR2AccessKey]: {
    Parameters: CloudflareR2AccessKeyParameters,
    Mappings: CloudflareR2AccessKeyMappings,
    Review: CloudflareR2AccessKeyReview
  },
  [SecretRotation.StripeApiKey]: {
    Parameters: StripeApiKeyParameters,
    Mappings: apiKeyMappings(SecretRotation.StripeApiKey),
    Review: StripeApiKeyReview
  },
  [SecretRotation.LiteLLMApiKey]: {
    Parameters: LiteLLMApiKeyParameters,
    Mappings: apiKeyMappings(SecretRotation.LiteLLMApiKey),
    Review: LiteLLMApiKeyReview
  },
  [SecretRotation.OpenRouterApiKey]: {
    Parameters: OpenRouterApiKeyParameters,
    Mappings: apiKeyMappings(SecretRotation.OpenRouterApiKey),
    Review: OpenRouterApiKeyReview
  }
} satisfies Partial<Record<SecretRotation, RotationViews>>;
