import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Code } from "@infisical/cipher/ui/code";
import { Field, FieldError } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Grid, Inline, InlineGrow, Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";

import { KEMP_DEFAULT_CA_NAME_SCHEMA } from "@app/components/pki-syncs/forms/schemas/kemp-loadmaster-pki-sync-destination-schema";
import { WindowsFileAccess } from "@app/hooks/api/pkiSyncs/enums";
import {
  CLOUDFLARE_BUNDLE_METHOD_AUTOMATIC_LABEL,
  CLOUDFLARE_BUNDLE_METHOD_LABELS,
  CloudflareBundleMethod
} from "@app/hooks/api/pkiSyncs/types/cloudflare-custom-certificate-sync";

import { valueAt } from "../draft-values";
import { TextField, useDraftField, useDraftValue, usePkiSyncDraft } from "../fields";
import { NameSchemaHelp } from "./name-schema-help";
import { ServerExportFormatFields } from "./server-export-format-fields";
import { PreserveArnField, PreserveItemOnRenewalField, SyncSwitchField } from "./sync-switch-field";

const AUTOMATIC = "automatic";

const toFieldError = (message?: string) => [message ? { message } : undefined];

const useDraftList = <T,>(name: string) => {
  const field = useDraftField<T[] | undefined>(name);
  const items = field.value ?? [];
  const [keys, setKeys] = useState(() => items.map(() => crypto.randomUUID()));
  const rowKeys =
    keys.length >= items.length
      ? keys
      : [...keys, ...items.slice(keys.length).map(() => crypto.randomUUID())];
  return {
    items,
    keys: rowKeys,
    append: (item: T) => {
      setKeys([...rowKeys.slice(0, items.length), crypto.randomUUID()]);
      field.onChange([...items, item]);
    },
    remove: (index: number) => {
      setKeys(rowKeys.filter((_, position) => position !== index));
      field.onChange(items.filter((_, position) => position !== index));
    }
  };
};

const WINDOWS_FILE_ACCESS_OPTIONS = [
  { value: WindowsFileAccess.Read, label: "Read" },
  { value: WindowsFileAccess.Modify, label: "Modify" },
  { value: WindowsFileAccess.FullControl, label: "Full Control" }
];

export const AwsCertificateManagerSyncOptions = PreserveArnField;

export const AwsElasticLoadBalancerSyncOptions = PreserveArnField;

export const AwsSecretsManagerSyncOptions = () => (
  <SyncSwitchField
    name="syncOptions.preserveSecretOnRenewal"
    label="Preserve secret on renewal"
    description="Applies to certificate renewals only. When enabled, the renewed certificate updates the existing secret, keeping the same name and ARN so consumers need no updates. When disabled, a new secret is created and the old one is removed."
    defaultChecked
  />
);

export const AzureKeyVaultSyncOptions = () => (
  <SyncSwitchField
    name="syncOptions.enableVersioning"
    label="Enable versioning on renewal"
    description="When enabled, renewals add a new version of the existing certificate in Azure Key Vault under the same name, so consumers automatically use the latest version. When disabled, a new certificate is created and the old one is removed."
    defaultChecked
  />
);

export const ChefSyncOptions = () => (
  <PreserveItemOnRenewalField
    label="Preserve data bag item on renewal"
    description="Applies to certificate renewals only. When enabled, the renewed certificate updates the existing data bag item, keeping the same name so Chef cookbooks and recipes need no updates. When disabled, a new item is created and the old one is removed."
  />
);

export const F5BigIpSyncOptions = () => (
  <PreserveItemOnRenewalField
    label="Preserve certificate on renewal"
    description="Applies to certificate renewals only. When enabled, the renewed certificate replaces the existing one under the same name, so any profile that uses it keeps working. When disabled, it is uploaded with a new name and the original stays on the BIG-IP."
  />
);

export const NetScalerSyncOptions = () => (
  <PreserveItemOnRenewalField
    label="Preserve certificate on renewal"
    description="Applies to certificate renewals only. When enabled, the renewed certificate updates the existing certkey object, keeping its name and vServer bindings. When disabled, a new certkey object is created and the old certificate remains on NetScaler."
  />
);

export const PaloAltoNetworksSyncOptions = () => (
  <PreserveItemOnRenewalField
    label="Preserve certificate on renewal"
    description="Applies to renewals only. When on, the renewed certificate replaces the existing certificate object under the same name, so anything that references it uses the renewed certificate. When off, the sync creates a new certificate object and moves the SSL/TLS service profile to it if the sync has one. The old object is deleted when removing certificates is allowed."
  />
);

export function CloudflareCustomCertificateSyncOptions() {
  const field = useDraftField<CloudflareBundleMethod | null | undefined>(
    "syncOptions.bundleMethod"
  );
  return (
    <Field
      label="Bundle method"
      help="How Cloudflare builds the chain it serves. Compatible and Modern may replace or drop the intermediates you upload. User-defined serves the uploaded chain exactly, which is required for certificates from a CA that is not publicly trusted. Automatic uses User-defined for certificates from an Infisical CA and Compatible for all others."
      error={field.error}
    >
      <Select
        value={field.value ?? AUTOMATIC}
        onValueChange={(value) =>
          field.onChange(value === AUTOMATIC ? null : (value as CloudflareBundleMethod))
        }
        options={[
          { value: AUTOMATIC, label: CLOUDFLARE_BUNDLE_METHOD_AUTOMATIC_LABEL },
          ...Object.values(CloudflareBundleMethod).map((method) => ({
            value: method,
            label: CLOUDFLARE_BUNDLE_METHOD_LABELS[method]
          }))
        ]}
        invalid={Boolean(field.error)}
      />
    </Field>
  );
}

function GcpLabelsEditor() {
  const { values, errors, setValue } = usePkiSyncDraft();
  const labels = useDraftList<{ key: string; value?: string }>("syncOptions.labels");
  return (
    <Stack gap={8}>
      {labels.items.map((_, index) => (
        <Inline key={labels.keys[index]} gap={8} align="start" wrap={false}>
          <InlineGrow>
            <Grid columns={2} gap={8}>
              {(["key", "value"] as const).map((part) => {
                const name = `syncOptions.labels.${index}.${part}`;
                const error = errors[name];
                return (
                  <Stack key={part} gap={4}>
                    <Input
                      name={name}
                      value={(valueAt(values, name) as string | undefined) ?? ""}
                      onChange={(event) => setValue(name, event.target.value)}
                      placeholder={part === "key" ? "Key" : "Value (optional)"}
                      aria-label={`Label ${index + 1} ${part === "key" ? "key" : "value"}`}
                      invalid={Boolean(error)}
                    />
                    <FieldError errors={toFieldError(error)} />
                  </Stack>
                );
              })}
            </Grid>
          </InlineGrow>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            icon="trash"
            iconOnly
            aria-label={`Remove label ${index + 1}`}
            onClick={() => labels.remove(index)}
          />
        </Inline>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon="plus"
          onClick={() => labels.append({ key: "", value: "" })}
        >
          Add label
        </Button>
      </div>
    </Stack>
  );
}

export function GcpCertificateManagerSyncOptions() {
  const { setValue } = usePkiSyncDraft();
  const labels = useDraftValue<unknown>("syncOptions.labels");
  const isConfiguringLabels = Array.isArray(labels);
  return (
    <>
      <PreserveItemOnRenewalField
        label="Preserve certificate on renewal"
        description="When enabled, an existing GCP certificate is updated in place and keeps its resource name, so certificate map entries and target proxies keep working with no change in GCP. This also pins the name against later edits to the certificate name schema. When disabled, a renewal or a name change creates a new GCP certificate under a new name, and the old one is only deleted if you also enable removal below. With removal off, replaced certificates stay in your GCP project and count against its limit."
      />
      <Switch
        layout="row"
        label="Configure labels"
        description={
          <>
            Applied to every certificate this sync manages, alongside the <Code>managed-by</Code>{" "}
            and <Code>infisical-certificate-id</Code> labels Infisical sets.
          </>
        }
        checked={isConfiguringLabels}
        onCheckedChange={(checked) =>
          setValue("syncOptions.labels", checked ? [{ key: "", value: "" }] : undefined)
        }
      />
      {isConfiguringLabels && <GcpLabelsEditor />}
    </>
  );
}

export function KempLoadMasterSyncOptions() {
  return (
    <>
      <PreserveItemOnRenewalField
        label="Preserve certificate on renewal"
        description="Applies to certificate renewals only. When enabled, the renewed certificate keeps the original certificate's identifier and replaces that entry in place, so any Virtual Service binding keeps working. When disabled, the renewed certificate is imported under a newly generated identifier and the original stays on the LoadMaster."
      />
      <TextField
        name="syncOptions.caCertificateNameSchema"
        label="CA certificate name schema"
        placeholder={KEMP_DEFAULT_CA_NAME_SCHEMA}
        help={
          <NameSchemaHelp>
            <span>
              Names each CA (intermediate) certificate that Infisical pushes into the
              LoadMaster&apos;s Intermediate Certs store.
            </span>
            <span>Available placeholders:</span>
            <ul>
              <li>
                <Code>{"{{fingerprint}}"}</Code>: a hash of the CA certificate. Include it so each
                distinct CA gets a unique name and is never duplicated.
              </li>
              <li>
                <Code>{"{{commonName}}"}</Code>: the CA certificate&apos;s common name
              </li>
            </ul>
            <span>
              A placeholder is optional. A schema with no placeholder resolves to a fixed name and
              can hold only one CA certificate. When placeholders resolve, any characters the
              destination doesn&apos;t support are replaced with hyphens.
            </span>
          </NameSchemaHelp>
        }
      />
    </>
  );
}

export function LinuxServerSyncOptions({ isUpdate }: { isUpdate?: boolean }) {
  return (
    <>
      <ServerExportFormatFields isUpdate={isUpdate} />
      <Grid columns={2} gap={8}>
        <TextField
          name="syncOptions.fileMode"
          label="File permissions"
          optional
          help="Octal mode for the delivered certificate and chain files (default 644)."
          placeholder="644"
        />
        <TextField
          name="syncOptions.privateKeyFileMode"
          label="Private key permissions"
          optional
          help="Octal mode for the delivered private key file (default 600)."
          placeholder="600"
        />
        <TextField
          name="syncOptions.owner"
          label="Owner"
          optional
          help="Owner applied to the delivered files (chown). Requires the connection user to be root or have passwordless sudo."
          placeholder="e.g. root"
        />
        <TextField
          name="syncOptions.group"
          label="Group"
          optional
          help="Group applied to the delivered files (chown). Requires the connection user to be root or have passwordless sudo."
          placeholder="e.g. ssl-cert"
        />
      </Grid>
    </>
  );
}

export function WindowsServerSyncOptions({ isUpdate }: { isUpdate?: boolean }) {
  const { values, errors, setValue } = usePkiSyncDraft();
  const accessRules = useDraftList<{ identity: string; access: WindowsFileAccess }>(
    "syncOptions.fileAccessRules"
  );
  return (
    <>
      <ServerExportFormatFields isUpdate={isUpdate} />
      <Field
        group
        label="File permissions"
        optional
        help="Grant Windows users or groups access to the delivered files (for example, restrict who can read the private key). Rules are added on top of the destination folder's inherited permissions."
      >
        <Stack gap={8}>
          {accessRules.items.map((_, index) => {
            const identity = `syncOptions.fileAccessRules.${index}.identity`;
            const access = `syncOptions.fileAccessRules.${index}.access`;
            return (
              <Inline key={accessRules.keys[index]} gap={8} align="start" wrap={false}>
                <InlineGrow>
                  <Stack gap={4}>
                    <Input
                      name={identity}
                      value={(valueAt(values, identity) as string | undefined) ?? ""}
                      onChange={(event) => setValue(identity, event.target.value)}
                      placeholder="DOMAIN\svc-account"
                      aria-label={`Rule ${index + 1} identity`}
                      invalid={Boolean(errors[identity])}
                    />
                    <FieldError errors={toFieldError(errors[identity])} />
                  </Stack>
                </InlineGrow>
                <Stack gap={4}>
                  <Select
                    aria-label={`Rule ${index + 1} access`}
                    width="md"
                    value={
                      (valueAt(values, access) as WindowsFileAccess | undefined) ??
                      WindowsFileAccess.Read
                    }
                    onValueChange={(value) => setValue(access, value)}
                    options={WINDOWS_FILE_ACCESS_OPTIONS}
                    invalid={Boolean(errors[access])}
                  />
                  <FieldError errors={toFieldError(errors[access])} />
                </Stack>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  icon="trash"
                  iconOnly
                  aria-label={`Remove permission rule ${index + 1}`}
                  onClick={() => accessRules.remove(index)}
                />
              </Inline>
            );
          })}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon="plus"
              onClick={() => accessRules.append({ identity: "", access: WindowsFileAccess.Read })}
            >
              Add permission
            </Button>
          </div>
        </Stack>
      </Field>
    </>
  );
}
