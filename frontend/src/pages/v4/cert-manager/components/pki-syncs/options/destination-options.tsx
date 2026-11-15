import { Controller, useFieldArray } from "react-hook-form";
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

import { errorOf, TextField, usePkiSyncForm, useWatchedValue } from "../fields";
import { NameSchemaHelp } from "./name-schema-help";
import { ServerExportFormatFields } from "./server-export-format-fields";
import { PreserveArnField, PreserveItemOnRenewalField, SyncSwitchField } from "./sync-switch-field";

const AUTOMATIC = "automatic";

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
  const { control } = usePkiSyncForm();
  return (
    <Controller
      control={control}
      name="syncOptions.bundleMethod"
      render={({ field, fieldState: { error } }) => (
        <Field
          label="Bundle method"
          help="How Cloudflare builds the chain it serves. Compatible and Modern may replace or drop the intermediates you upload. User-defined serves the uploaded chain exactly, which is required for certificates from a CA that is not publicly trusted. Automatic uses User-defined for certificates from an Infisical CA and Compatible for all others."
          error={errorOf(error)}
        >
          <Select
            value={(field.value as CloudflareBundleMethod | null | undefined) ?? AUTOMATIC}
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
            invalid={Boolean(error)}
          />
        </Field>
      )}
    />
  );
}

function GcpLabelsEditor() {
  const { control } = usePkiSyncForm();
  const labelFields = useFieldArray({ control, name: "syncOptions.labels" as never });
  return (
    <Stack gap={8}>
      {labelFields.fields.map(({ id }, index) => (
        <Inline key={id} gap={8} align="start" wrap={false}>
          <InlineGrow>
            <Grid columns={2} gap={8}>
              {(["key", "value"] as const).map((part) => (
                <Controller
                  key={part}
                  control={control}
                  name={`syncOptions.labels.${index}.${part}` as never}
                  render={({ field, fieldState: { error } }) => (
                    <Stack gap={4}>
                      <Input
                        ref={field.ref}
                        name={field.name}
                        value={(field.value as string | undefined) ?? ""}
                        onBlur={field.onBlur}
                        onChange={(event) => field.onChange(event.target.value)}
                        placeholder={part === "key" ? "Key" : "Value (optional)"}
                        aria-label={`Label ${index + 1} ${part === "key" ? "key" : "value"}`}
                        invalid={Boolean(error)}
                      />
                      <FieldError errors={[error]} />
                    </Stack>
                  )}
                />
              ))}
            </Grid>
          </InlineGrow>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            icon="trash"
            iconOnly
            aria-label={`Remove label ${index + 1}`}
            onClick={() => labelFields.remove(index)}
          />
        </Inline>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon="plus"
          onClick={() => labelFields.append({ key: "", value: "" } as never)}
        >
          Add label
        </Button>
      </div>
    </Stack>
  );
}

export function GcpCertificateManagerSyncOptions() {
  const { setValue } = usePkiSyncForm();
  const labels = useWatchedValue<unknown>("syncOptions.labels");
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
          setValue(
            "syncOptions.labels" as never,
            (checked ? [{ key: "", value: "" }] : undefined) as never,
            { shouldDirty: true }
          )
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
  const { control } = usePkiSyncForm();
  const accessRules = useFieldArray({ control, name: "syncOptions.fileAccessRules" as never });
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
          {accessRules.fields.map(({ id }, index) => (
            <Inline key={id} gap={8} align="start" wrap={false}>
              <InlineGrow>
                <Controller
                  control={control}
                  name={`syncOptions.fileAccessRules.${index}.identity` as never}
                  render={({ field, fieldState: { error } }) => (
                    <Stack gap={4}>
                      <Input
                        ref={field.ref}
                        name={field.name}
                        value={(field.value as string | undefined) ?? ""}
                        onBlur={field.onBlur}
                        onChange={(event) => field.onChange(event.target.value)}
                        placeholder="DOMAIN\svc-account"
                        aria-label={`Rule ${index + 1} identity`}
                        invalid={Boolean(error)}
                      />
                      <FieldError errors={[error]} />
                    </Stack>
                  )}
                />
              </InlineGrow>
              <Controller
                control={control}
                name={`syncOptions.fileAccessRules.${index}.access` as never}
                render={({ field, fieldState: { error } }) => (
                  <Stack gap={4}>
                    <Select
                      aria-label={`Rule ${index + 1} access`}
                      width="md"
                      value={
                        (field.value as WindowsFileAccess | undefined) ?? WindowsFileAccess.Read
                      }
                      onValueChange={field.onChange}
                      options={WINDOWS_FILE_ACCESS_OPTIONS}
                      invalid={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </Stack>
                )}
              />
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
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon="plus"
              onClick={() =>
                accessRules.append({ identity: "", access: WindowsFileAccess.Read } as never)
              }
            >
              Add permission
            </Button>
          </div>
        </Stack>
      </Field>
    </>
  );
}
