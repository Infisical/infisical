import { type ReactNode, useEffect, useRef } from "react";
import { Controller, useFieldArray, useWatch } from "react-hook-form";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { Combobox } from "@app/components/v4/ui/combobox";
import { FieldError, FieldLabel } from "@app/components/v4/ui/field";
import { Grid, Inline, Stack } from "@app/components/v4/ui/layout";
import { Select, type SelectOption } from "@app/components/v4/ui/select";
import { SmallText } from "@app/components/v4/ui/text";

import {
  InfoTip,
  notListedHint,
  PasswordRequirementsFields,
  PasswordRequirementsReview,
  ResourceComboboxField,
  ReviewSection,
  RotationField,
  type RotationViews,
  SecretsMappingFields,
  TextField,
  useConnectionId,
  useIsUpdate,
  useRotationForm
} from "../fields";
import { ROTATION_TEMPLATES } from "../model";
import {
  AppConnection,
  DBT_PERMISSION_SET_MAP,
  DbtPermissionsSet,
  DEFAULT_PASSWORD_REQUIREMENTS,
  HpIloRotationMethod,
  LdapPasswordRotationMethod,
  SecretRotation,
  SupabaseApiKeyType,
  UnixLinuxLocalAccountRotationMethod,
  WindowsLocalAccountRotationMethod
} from "../schemas";

const methodOptions = (methods: Record<string, string>): SelectOption[] =>
  Object.values(methods).map((method) => ({
    value: method,
    label: method
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }));

const methodTooltip = (items: [string, string][]) => (
  <>
    <span>Determines how the rotation will be performed:</span>
    <ul className="mt-2 ml-4 flex list-disc flex-col gap-2">
      {items.map(([name, text]) => (
        <li key={name}>
          <span className="font-medium">{name}</span> - {text}
        </li>
      ))}
    </ul>
  </>
);

function RotationMethodField({
  defaultValue,
  options,
  tooltip,
  description,
  onMethodChange
}: {
  defaultValue: string;
  options: SelectOption[];
  tooltip: ReactNode;
  description: (value: string) => string;
  onMethodChange: (value: string) => void;
}) {
  const { control } = useRotationForm();
  const isUpdate = useIsUpdate();
  return (
    <Controller
      control={control}
      name="parameters.rotationMethod"
      defaultValue={defaultValue}
      render={({ field, fieldState: { error } }) => (
        <RotationField
          label="Rotation Method"
          tooltip={tooltip}
          description={isUpdate ? "Cannot be updated." : description(field.value)}
          error={error?.message}
        >
          <Select
            disabled={isUpdate}
            value={field.value ?? ""}
            onValueChange={(value) => {
              onMethodChange(value);
              field.onChange(value);
            }}
            options={options}
            invalid={Boolean(error)}
          />
        </RotationField>
      )}
    />
  );
}

function CurrentPasswordField({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <TextField
      name="temporaryParameters.password"
      label={label}
      tooltip={tooltip}
      type="password"
      placeholder="****************"
    />
  );
}

function TargetRow({ target, password }: { target: ReactNode; password: ReactNode }) {
  if (!password) return target;
  return (
    <Grid columns={2} gap={12}>
      {target}
      {password}
    </Grid>
  );
}

const CURRENT_PASSWORD_TOOLTIP =
  "The current password of the target user. Required for initial rotation setup.";

const LOGIN_AS_TARGET_TOOLTIP_ITEM: [string, string] = [
  "Login as Target",
  "The target user will authenticate with their own credentials and change their own password."
];

function LdapPasswordParameters() {
  const { control, setValue } = useRotationForm();
  const rotationMethod = useWatch({ control, name: "parameters.rotationMethod" });
  const isUpdate = useIsUpdate();
  return (
    <>
      <RotationMethodField
        defaultValue={LdapPasswordRotationMethod.ConnectionPrincipal}
        options={methodOptions(LdapPasswordRotationMethod)}
        tooltip={methodTooltip([
          [
            "Connection Principal",
            "The Connection principal will rotate the target principal's password."
          ],
          ["Target Principal", "The target principal will rotate their own password."]
        ])}
        description={(value) =>
          value === LdapPasswordRotationMethod.ConnectionPrincipal
            ? "The connection principal will rotate the target principal's password"
            : "The target principal will rotate their own password"
        }
        onMethodChange={(value) =>
          setValue(
            "temporaryParameters",
            value === LdapPasswordRotationMethod.TargetPrincipal ? { password: "" } : undefined
          )
        }
      />
      <TargetRow
        target={
          <TextField
            name="parameters.dn"
            label="Target Principal's DN/UPN"
            tooltip="The DN/UPN of the principal that you want to perform password rotation on."
            placeholder="CN=John,OU=Users,DC=example,DC=com"
            disabled={isUpdate}
            description={isUpdate ? "Cannot be updated." : undefined}
          />
        }
        password={
          !isUpdate &&
          rotationMethod === LdapPasswordRotationMethod.TargetPrincipal && (
            <CurrentPasswordField label="Target Principal's Password" />
          )
        }
      />
      <PasswordRequirementsFields />
    </>
  );
}

function UseSudoField() {
  const { control } = useRotationForm();
  return (
    <Controller
      control={control}
      name="parameters.useSudo"
      defaultValue
      render={({ field, fieldState: { error } }) => (
        <Stack gap={4}>
          <Inline gap={4} wrap={false}>
            <Checkbox
              ref={field.ref}
              label="Use sudo to change password"
              checked={Boolean(field.value)}
              onCheckedChange={(checked) => field.onChange(checked)}
            />
            <InfoTip content="When enabled, uses 'sudo passwd' to change the password. When disabled, uses 'passwd' directly. Enable this if the SSH connection user requires sudo privileges to change other users' passwords. If sudo prompts for a password, the app connection password will be provided automatically." />
          </Inline>
          {error?.message && <FieldError>{error.message}</FieldError>}
        </Stack>
      )}
    />
  );
}

function UnixLinuxLocalAccountParameters() {
  const { control, setValue } = useRotationForm();
  const isUpdate = useIsUpdate();
  const rotationMethod =
    useWatch({ control, name: "parameters.rotationMethod" }) ??
    UnixLinuxLocalAccountRotationMethod.LoginAsTarget;
  return (
    <>
      <RotationMethodField
        defaultValue={UnixLinuxLocalAccountRotationMethod.LoginAsTarget}
        options={methodOptions(UnixLinuxLocalAccountRotationMethod)}
        tooltip={methodTooltip([
          [
            "Login as Root",
            "The SSH connection credentials of the app connection linked will be used to change the target user's password."
          ],
          LOGIN_AS_TARGET_TOOLTIP_ITEM
        ])}
        description={(value) =>
          value === UnixLinuxLocalAccountRotationMethod.LoginAsRoot
            ? "The SSH connection credentials will change the target user's password"
            : "The target user will change their own password"
        }
        onMethodChange={() => setValue("temporaryParameters", { password: "" })}
      />
      {rotationMethod === UnixLinuxLocalAccountRotationMethod.LoginAsRoot && <UseSudoField />}
      <TargetRow
        target={
          <TextField
            name="parameters.username"
            label="Target Username"
            tooltip="The Unix/Linux username of the account to rotate the password for."
            placeholder="appuser"
            disabled={isUpdate}
            description={isUpdate ? "Cannot be updated." : undefined}
          />
        }
        password={
          !isUpdate &&
          rotationMethod === UnixLinuxLocalAccountRotationMethod.LoginAsTarget && (
            <CurrentPasswordField label="Current Password" tooltip={CURRENT_PASSWORD_TOOLTIP} />
          )
        }
      />
      <PasswordRequirementsFields />
    </>
  );
}

function WindowsLocalAccountParameters() {
  const { control, setValue } = useRotationForm();
  const isUpdate = useIsUpdate();
  const rotationMethod =
    useWatch({ control, name: "parameters.rotationMethod" }) ??
    WindowsLocalAccountRotationMethod.LoginAsTarget;
  return (
    <>
      <RotationMethodField
        defaultValue={WindowsLocalAccountRotationMethod.LoginAsTarget}
        options={methodOptions(WindowsLocalAccountRotationMethod)}
        tooltip={methodTooltip([
          [
            "Login as Root",
            "The SMB connection credentials of the app connection linked will be used to change the target user's password."
          ],
          LOGIN_AS_TARGET_TOOLTIP_ITEM
        ])}
        description={(value) =>
          value === WindowsLocalAccountRotationMethod.LoginAsRoot
            ? "The SMB connection credentials will change the target user's password"
            : "The target user will change their own password"
        }
        onMethodChange={() => setValue("temporaryParameters", { password: "" })}
      />
      <TargetRow
        target={
          <TextField
            name="parameters.username"
            label="Target Username"
            tooltip="The Windows username of the account to rotate the password for."
            placeholder="appuser"
            disabled={isUpdate}
            description={isUpdate ? "Cannot be updated." : undefined}
          />
        }
        password={
          !isUpdate &&
          rotationMethod === WindowsLocalAccountRotationMethod.LoginAsTarget && (
            <CurrentPasswordField label="Current Password" tooltip={CURRENT_PASSWORD_TOOLTIP} />
          )
        }
      />
      <PasswordRequirementsFields />
    </>
  );
}

const HP_ILO_DEFAULT_PASSWORD_REQUIREMENTS = {
  length: 39,
  required: {
    lowercase: 1,
    uppercase: 1,
    digits: 1,
    symbols: 0
  }
};

const useIsSshConnection = () => {
  const { control } = useRotationForm();
  return useWatch({ control, name: "connection.app" }) !== AppConnection.HpeIloRedFish;
};

function HpIloParameters() {
  const { control, setValue } = useRotationForm();
  const rotationMethod =
    useWatch({ control, name: "parameters.rotationMethod" }) ?? HpIloRotationMethod.LoginAsRoot;
  const isSshConnection = useIsSshConnection();
  const isUpdate = useIsUpdate();

  useEffect(() => {
    if (isSshConnection || isUpdate) return;
    setValue("parameters.rotationMethod", undefined);
    setValue("temporaryParameters", undefined);
  }, [isSshConnection, isUpdate, setValue]);

  return (
    <>
      {isSshConnection && (
        <RotationMethodField
          defaultValue={HpIloRotationMethod.LoginAsRoot}
          options={methodOptions(HpIloRotationMethod)}
          tooltip={methodTooltip([
            [
              "Login as Root",
              "The SSH connection credentials of the app connection linked will be used to change the target user's password."
            ],
            LOGIN_AS_TARGET_TOOLTIP_ITEM
          ])}
          description={(value) =>
            value === HpIloRotationMethod.LoginAsRoot
              ? "The SSH connection credentials will change the target user's password"
              : "The target user will change their own password"
          }
          onMethodChange={() => setValue("temporaryParameters", { password: "" })}
        />
      )}
      <TargetRow
        target={
          <TextField
            name="parameters.username"
            label="Target Username"
            tooltip="The HP iLO username of the account to rotate the password for."
            placeholder="ilo_user"
            disabled={isUpdate}
            description={isUpdate ? "Cannot be updated." : undefined}
          />
        }
        password={
          !isUpdate &&
          isSshConnection &&
          rotationMethod === HpIloRotationMethod.LoginAsTarget && (
            <CurrentPasswordField label="Current Password" tooltip={CURRENT_PASSWORD_TOOLTIP} />
          )
        }
      />
      <PasswordRequirementsFields defaultRequirements={HP_ILO_DEFAULT_PASSWORD_REQUIREMENTS} />
    </>
  );
}

const DBT_PROJECTS = [
  { id: 70001, name: "demo-analytics" },
  { id: 70002, name: "demo-marketing-models" },
  { id: 70003, name: "demo-finance-reporting" }
];

const ALL_PROJECTS = "all";

const DBT_PERMISSION_SET_OPTIONS: SelectOption[] = Object.entries(DBT_PERMISSION_SET_MAP).map(
  ([permissionSet, { label, isEnterpriseOnly }]) => ({
    value: permissionSet,
    label,
    description: isEnterpriseOnly ? "DBT Enterprise" : undefined
  })
);

const DEFAULT_DBT_GRANT = { permissionSet: DbtPermissionsSet.AccountAdmin, projectId: undefined };

function DbtServiceTokenParameters() {
  const { control, getValues, setValue } = useRotationForm();
  const connectionId = useConnectionId();
  const permissionGrantsFields = useFieldArray({ control, name: "parameters.permissionGrants" });
  const projectOptions = connectionId
    ? [
        { value: ALL_PROJECTS, label: "All projects" },
        ...DBT_PROJECTS.map((project) => ({ value: String(project.id), label: project.name }))
      ]
    : [];

  useEffect(() => {
    if (!getValues("parameters.permissionGrants")?.length) {
      setValue("parameters.permissionGrants", [DEFAULT_DBT_GRANT]);
    }
  }, [getValues, setValue]);

  return (
    <>
      <TextField
        name="parameters.tokenName"
        label="Service Token Name"
        tooltip="Enter a name for the service token to be created."
        placeholder="infisical-service-token"
      />
      <Stack gap={8}>
        <FieldLabel>Permission Grants</FieldLabel>
        <Stack
          gap={8}
          className={
            permissionGrantsFields.fields.length >= 5 ? "max-h-72 overflow-y-auto" : undefined
          }
        >
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
            <SmallText muted>Permission set</SmallText>
            <SmallText muted>Projects</SmallText>
            <span className="w-8" aria-hidden />
          </div>
          {permissionGrantsFields.fields.map(({ id }, i) => (
            <div
              key={id}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2"
            >
              <Controller
                control={control}
                name={`parameters.permissionGrants.${i}.permissionSet`}
                render={({ field, fieldState: { error } }) => (
                  <Stack gap={4} className="min-w-0">
                    <Select
                      label={`Permission set ${i + 1}`}
                      value={field.value}
                      onValueChange={(next) => {
                        if (!next || next === field.value) return;
                        field.onChange(next);
                      }}
                      options={DBT_PERMISSION_SET_OPTIONS}
                      invalid={Boolean(error)}
                    />
                    {error?.message && <FieldError>{error.message}</FieldError>}
                  </Stack>
                )}
              />
              <Controller
                control={control}
                name={`parameters.permissionGrants.${i}.projectId`}
                render={({ field, fieldState: { error } }) => {
                  const projectValue =
                    field.value === undefined ? ALL_PROJECTS : String(field.value);
                  return (
                    <Stack gap={4} className="min-w-0">
                      <Combobox
                        ref={field.ref}
                        label={`Projects ${i + 1}`}
                        value={connectionId ? projectValue : ""}
                        onValueChange={(next) =>
                          field.onChange(next && next !== ALL_PROJECTS ? Number(next) : undefined)
                        }
                        options={projectOptions}
                        disabled={!connectionId}
                        invalid={Boolean(error)}
                      />
                      {error?.message && <FieldError>{error.message}</FieldError>}
                    </Stack>
                  );
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                icon="trash"
                iconOnly
                onClick={() => {
                  const grants = getValues("parameters.permissionGrants");
                  if (grants && grants.length > 1) {
                    permissionGrantsFields.remove(i);
                  } else {
                    setValue("parameters.permissionGrants", [DEFAULT_DBT_GRANT]);
                  }
                }}
              >
                Delete grant
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              size="xs"
              variant="outline"
              icon="plus"
              onClick={() => permissionGrantsFields.append(DEFAULT_DBT_GRANT)}
            >
              Add grant
            </Button>
          </div>
        </Stack>
      </Stack>
    </>
  );
}

const SNOWFLAKE_USERS = ["DEMO_ETL_SERVICE", "DEMO_REPORTING_SERVICE", "DEMO_DBT_RUNNER"];

const RSA_MODULUS_LENGTHS = [2048, 4096] as const;

function SnowflakeUserKeyPairParameters() {
  const { control } = useRotationForm();
  const connectionId = useConnectionId();
  const isUpdate = useIsUpdate();
  return (
    <>
      <Controller
        control={control}
        name="parameters.username"
        render={({ field, fieldState: { error } }) => (
          <RotationField
            label="User"
            description={
              isUpdate
                ? "Cannot be updated."
                : notListedHint(
                    "Don't see the user you're looking for?",
                    "Select an existing Snowflake user, or type a new username to create it. New users are created as key-pair-only SERVICE users. Ensure your connection's role has the privileges to list users, alter the user's RSA public key, and (for new users) create users. If the keys are rotated the user will continue to exist."
                  )
            }
            error={error?.message}
          >
            <Combobox
              ref={field.ref}
              label="User"
              value={field.value ?? ""}
              onValueChange={field.onChange}
              onCreate={(inputValue) => field.onChange(inputValue)}
              options={
                connectionId ? SNOWFLAKE_USERS.map((name) => ({ value: name, label: name })) : []
              }
              placeholder="Select or add a new user..."
              disabled={!connectionId || isUpdate}
              invalid={Boolean(error)}
            />
          </RotationField>
        )}
      />
      <Controller
        control={control}
        name="parameters.modulusLength"
        defaultValue={2048}
        render={({ field, fieldState: { error } }) => (
          <RotationField
            label="RSA Modulus Length"
            tooltip="The size in bits of the generated RSA key pairs. 2048-bit keys are faster to generate and use; 4096-bit keys provide a larger security margin."
            error={error?.message}
          >
            <Select
              value={String(field.value)}
              onValueChange={(value) => field.onChange(Number(value))}
              options={RSA_MODULUS_LENGTHS.map((length) => ({
                value: String(length),
                label: `${length}-bit`
              }))}
              invalid={Boolean(error)}
            />
          </RotationField>
        )}
      />
    </>
  );
}

const SUPABASE_PROJECTS = [
  { id: "demoprojref0000000001", name: "demo-web-app" },
  { id: "demoprojref0000000002", name: "demo-staging" }
];

const SUPABASE_KEY_TYPE_OPTIONS = [
  { label: "Publishable", value: SupabaseApiKeyType.Publishable },
  { label: "Secret", value: SupabaseApiKeyType.Secret }
];

function SupabaseApiKeyParameters() {
  return (
    <>
      <ResourceComboboxField
        name="parameters.projectRef"
        label="Project"
        tooltip="The Supabase project to rotate the API key for"
        placeholder="Select a project..."
        options={SUPABASE_PROJECTS.map((project) => ({
          value: project.id,
          label: `${project.name} (id: ${project.id})`
        }))}
      />
      <ResourceComboboxField
        name="parameters.keyType"
        label="Key Type"
        tooltip="Publishable keys are safe to use in browsers and client-side code. Secret keys grant privileged access to the project API and should never be exposed publicly."
        placeholder="Select a key type..."
        options={SUPABASE_KEY_TYPE_OPTIONS}
        requiresConnection={false}
      />
    </>
  );
}

const useMapping = () => {
  const { control } = useRotationForm();
  return (useWatch({ control, name: "secretsMapping" }) ?? {}) as Record<string, string>;
};

const useParameters = () => {
  const { control } = useRotationForm();
  return (useWatch({ control, name: "parameters" }) ?? {}) as Record<string, unknown>;
};

function LdapPasswordMappings() {
  const { secretsMapping } = ROTATION_TEMPLATES[SecretRotation.LdapPassword];
  return (
    <SecretsMappingFields
      items={[
        { name: "DN/UPN", key: "dn", placeholder: secretsMapping.dn },
        { name: "Password", key: "password", placeholder: secretsMapping.password }
      ]}
    />
  );
}

function UsernamePasswordMappings({
  type
}: {
  type: SecretRotation.UnixLinuxLocalAccount | SecretRotation.WindowsLocalAccount;
}) {
  const { secretsMapping } = ROTATION_TEMPLATES[type];
  return (
    <SecretsMappingFields
      items={[
        { name: "Username", key: "username", placeholder: secretsMapping.username },
        { name: "Password", key: "password", placeholder: secretsMapping.password }
      ]}
    />
  );
}

function HpIloMappings() {
  return (
    <>
      <TextField
        name="secretsMapping.username"
        label="Username"
        placeholder="ILO_USERNAME"
        description="The secret key where the iLO username will be stored"
      />
      <TextField
        name="secretsMapping.password"
        label="Password"
        placeholder="ILO_PASSWORD"
        description="The secret key where the rotated iLO password will be stored"
      />
    </>
  );
}

function DbtServiceTokenMappings() {
  const { secretsMapping } = ROTATION_TEMPLATES[SecretRotation.DbtServiceToken];
  return (
    <SecretsMappingFields
      items={[
        { name: "Service Token", key: "serviceToken", placeholder: secretsMapping.serviceToken }
      ]}
    />
  );
}

function SnowflakeUserKeyPairMappings() {
  const { secretsMapping } = ROTATION_TEMPLATES[SecretRotation.SnowflakeUserKeyPair];
  return (
    <SecretsMappingFields
      items={[
        { name: "Private Key", key: "privateKey", placeholder: secretsMapping.privateKey },
        { name: "Public Key", key: "publicKey", placeholder: secretsMapping.publicKey }
      ]}
    />
  );
}

const SUPABASE_DEFAULT_SECRET_NAME: Record<SupabaseApiKeyType, string> = {
  [SupabaseApiKeyType.Publishable]: "SUPABASE_PUBLISHABLE_API_KEY",
  [SupabaseApiKeyType.Secret]: "SUPABASE_SECRET_API_KEY"
};

function SupabaseApiKeyMappings() {
  const { control, setValue } = useRotationForm();
  const keyType = useWatch({ control, name: "parameters.keyType" }) as
    | SupabaseApiKeyType
    | undefined;
  const prevKeyTypeRef = useRef<SupabaseApiKeyType | undefined>(undefined);

  useEffect(() => {
    if (keyType && prevKeyTypeRef.current !== keyType) {
      setValue("secretsMapping.apiKey", SUPABASE_DEFAULT_SECRET_NAME[keyType]);
    }
    prevKeyTypeRef.current = keyType;
  }, [keyType, setValue]);

  return (
    <SecretsMappingFields
      items={[
        {
          name: "API Key",
          key: "apiKey",
          placeholder: keyType ? SUPABASE_DEFAULT_SECRET_NAME[keyType] : "SUPABASE_API_KEY"
        }
      ]}
    />
  );
}

type PasswordRequirements = typeof DEFAULT_PASSWORD_REQUIREMENTS | undefined;

function LdapPasswordReview() {
  const parameters = useParameters();
  const mapping = useMapping();
  return (
    <>
      <ReviewSection label="Parameters" items={[["DN/UPN", parameters.dn as string]]} />
      <PasswordRequirementsReview
        requirements={parameters.passwordRequirements as PasswordRequirements}
      />
      <ReviewSection
        label="Secrets Mapping"
        items={[
          ["DN/UPN", mapping.dn],
          ["Password", mapping.password]
        ]}
      />
    </>
  );
}

function UnixLinuxLocalAccountReview() {
  const parameters = useParameters();
  const mapping = useMapping();
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[
          ["Username", parameters.username as string],
          ["Use Sudo", parameters.useSudo ? "Yes" : "No"]
        ]}
      />
      <PasswordRequirementsReview
        requirements={parameters.passwordRequirements as PasswordRequirements}
      />
      <ReviewSection
        label="Secrets Mapping"
        items={[
          ["Username", mapping.username],
          ["Password", mapping.password]
        ]}
      />
    </>
  );
}

function WindowsLocalAccountReview() {
  const parameters = useParameters();
  const mapping = useMapping();
  return (
    <>
      <ReviewSection label="Parameters" items={[["Username", parameters.username as string]]} />
      <PasswordRequirementsReview
        requirements={parameters.passwordRequirements as PasswordRequirements}
      />
      <ReviewSection
        label="Secrets Mapping"
        items={[
          ["Username", mapping.username],
          ["Password", mapping.password]
        ]}
      />
    </>
  );
}

function HpIloReview() {
  const parameters = useParameters();
  const mapping = useMapping();
  const isSshConnection = useIsSshConnection();
  const passwordRequirements = parameters.passwordRequirements as PasswordRequirements;
  const rotationMethod = parameters.rotationMethod as string | undefined;
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[
          ["Username", parameters.username as string],
          ...(isSshConnection
            ? [
                [
                  "Rotation Method",
                  rotationMethod?.replace(/-/g, " ") || "Login as target"
                ] as const
              ]
            : []),
          ["Password Length", `${passwordRequirements?.length || 32} characters`]
        ]}
      />
      <ReviewSection
        label="Secrets Mapping"
        items={[
          ["Username Key", mapping.username],
          ["Password Key", mapping.password]
        ]}
      />
    </>
  );
}

function DbtServiceTokenReview() {
  const parameters = useParameters();
  const mapping = useMapping();
  const grants = (parameters.permissionGrants ?? []) as {
    permissionSet: DbtPermissionsSet;
    projectId?: number;
  }[];
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={grants.map(
          (grant, i) =>
            [
              `Permission Grant ${i + 1}`,
              <Inline key={`grant-${i + 1}`} gap={8}>
                <span>{DBT_PERMISSION_SET_MAP[grant.permissionSet]?.label}</span>
                <Badge tone={grant.projectId ? "soft" : "info"}>
                  {grant.projectId ? `Project: ${grant.projectId}` : "All Projects"}
                </Badge>
              </Inline>
            ] as const
        )}
      />
      <ReviewSection label="Secrets Mapping" items={[["Service Token", mapping.serviceToken]]} />
    </>
  );
}

function SnowflakeUserKeyPairReview() {
  const parameters = useParameters();
  const mapping = useMapping();
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[
          ["User", parameters.username as string],
          ["RSA Modulus Length", `${parameters.modulusLength}-bit`]
        ]}
      />
      <ReviewSection
        label="Secrets Mapping"
        items={[
          ["Private Key", mapping.privateKey],
          ["Public Key", mapping.publicKey]
        ]}
      />
    </>
  );
}

function SupabaseApiKeyReview() {
  const parameters = useParameters();
  const mapping = useMapping();
  const keyType = parameters.keyType as SupabaseApiKeyType;
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[
          ["Project Reference", parameters.projectRef as string],
          [
            "Key Type",
            SUPABASE_KEY_TYPE_OPTIONS.find((option) => option.value === keyType)?.label || keyType
          ]
        ]}
      />
      <ReviewSection label="Secrets Mapping" items={[["API Key", mapping.apiKey]]} />
    </>
  );
}

export const accountRotationViews = {
  [SecretRotation.LdapPassword]: {
    Parameters: LdapPasswordParameters,
    Mappings: LdapPasswordMappings,
    Review: LdapPasswordReview
  },
  [SecretRotation.UnixLinuxLocalAccount]: {
    Parameters: UnixLinuxLocalAccountParameters,
    Mappings: () => <UsernamePasswordMappings type={SecretRotation.UnixLinuxLocalAccount} />,
    Review: UnixLinuxLocalAccountReview
  },
  [SecretRotation.WindowsLocalAccount]: {
    Parameters: WindowsLocalAccountParameters,
    Mappings: () => <UsernamePasswordMappings type={SecretRotation.WindowsLocalAccount} />,
    Review: WindowsLocalAccountReview
  },
  [SecretRotation.HpIloLocalAccount]: {
    Parameters: HpIloParameters,
    Mappings: HpIloMappings,
    Review: HpIloReview
  },
  [SecretRotation.DbtServiceToken]: {
    Parameters: DbtServiceTokenParameters,
    Mappings: DbtServiceTokenMappings,
    Review: DbtServiceTokenReview
  },
  [SecretRotation.SnowflakeUserKeyPair]: {
    Parameters: SnowflakeUserKeyPairParameters,
    Mappings: SnowflakeUserKeyPairMappings,
    Review: SnowflakeUserKeyPairReview
  },
  [SecretRotation.SupabaseApiKey]: {
    Parameters: SupabaseApiKeyParameters,
    Mappings: SupabaseApiKeyMappings,
    Review: SupabaseApiKeyReview
  }
} satisfies Partial<Record<SecretRotation, RotationViews>>;
