import { useId, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { Select } from "@infisical/cipher/ui/select";
import {
  SheetBody,
  SheetFooter,
  SheetHeader,
  SheetSections,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { SmallText } from "@infisical/cipher/ui/text";
import type { ZodError } from "zod";

import {
  AddExternalKmsSchema,
  ExternalKmsAwsSchema,
  ExternalKmsGcpCredentialSchema,
  type ExternalKmsGcpCredentialSchemaType,
  ExternalKmsProvider,
  type Kms,
  KmsAwsCredentialType,
  UpdateExternalKmsSchema
} from "@app/hooks/api/kms/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { AWS_REGIONS, GCP_REGIONS, KMS_PROVIDERS } from "./kms-providers";

export type KmsFormMode = "create" | "details" | "credentials";

export type KmsFormHandle = { dirty: boolean };

export type KmsFormProps = {
  ref?: React.Ref<KmsFormHandle>;
  kms?: Kms;
  mode: KmsFormMode;
  onBack?: () => void;
  onCancel: () => void;
  onDone: () => void;
  onPendingChange: (pending: boolean) => void;
};

type Errors = Record<string, string | undefined>;

const issuesOf = (error?: ZodError): Errors =>
  Object.fromEntries(
    (error?.issues ?? []).map((issue) => [String(issue.path.at(-1)), issue.message])
  );

const GCP_CREDENTIAL_MAX_BYTES = 8 * 1024;

const titleOf = (provider: ExternalKmsProvider, mode: KmsFormMode) => {
  const name = KMS_PROVIDERS[provider].title;
  if (mode === "create") return `Add ${name}`;
  if (mode === "details") return `Edit ${name} details`;
  return `Edit ${name} credentials`;
};

const submitLabelOf = (mode: KmsFormMode) => {
  if (mode === "create") return "Add KMS";
  if (mode === "credentials") return "Update credentials";
  return "Save";
};

const FormSheet = ({
  provider,
  mode,
  formId,
  pending,
  dirty,
  onBack,
  onCancel,
  onSubmit,
  children
}: {
  provider: ExternalKmsProvider;
  mode: KmsFormMode;
  formId: string;
  pending: boolean;
  dirty: boolean;
  onBack?: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) => (
  <SheetSections
    header={
      <SheetHeader>
        <SheetTitle>{titleOf(provider, mode)}</SheetTitle>
      </SheetHeader>
    }
    footer={
      <SheetFooter>
        <Inline gap={8} justify="between">
          {onBack ? (
            <Button variant="ghost" icon="chev-left" disabled={pending} onClick={onBack}>
              Back
            </Button>
          ) : (
            <span />
          )}
          <Inline gap={8}>
            <Button variant="outline" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              loading={pending}
              disabledReason={mode !== "create" && !dirty ? "No changes to save" : undefined}
            >
              {submitLabelOf(mode)}
            </Button>
          </Inline>
        </Inline>
      </SheetFooter>
    }
  >
    <SheetBody>
      <form
        id={formId}
        noValidate
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Stack gap={16}>{children}</Stack>
      </form>
    </SheetBody>
  </SheetSections>
);

const DetailFields = ({
  name,
  description,
  errors,
  onName,
  onDescription
}: {
  name: string;
  description: string;
  errors: Errors;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
}) => (
  <>
    <Field label="Alias" error={errors.name}>
      <Input
        value={name}
        invalid={Boolean(errors.name)}
        placeholder="production-kms"
        onChange={(event) => onName(event.target.value)}
      />
    </Field>
    <Field label="Description" optional>
      <Input
        value={description}
        placeholder="KMS for production organization data"
        onChange={(event) => onDescription(event.target.value)}
      />
    </Field>
  </>
);

type AwsDraft = {
  name: string;
  description: string;
  type: KmsAwsCredentialType;
  accessKey: string;
  secretKey: string;
  assumeRoleArn: string;
  externalId: string;
  awsRegion: string;
  kmsKeyId: string;
};

const awsDraftOf = (kms?: Kms): AwsDraft => {
  const configuration = kms?.externalKms.configuration ?? {};
  const data = configuration.credential?.data ?? {};
  return {
    name: kms?.name ?? "",
    description: kms?.description ?? "",
    type: configuration.credential?.type ?? KmsAwsCredentialType.AssumeRole,
    accessKey: data.accessKey ?? "",
    secretKey: data.secretKey ?? "",
    assumeRoleArn: data.assumeRoleArn ?? "",
    externalId: data.externalId ?? "",
    awsRegion: configuration.awsRegion ?? "",
    kmsKeyId: configuration.kmsKeyId ?? ""
  };
};

const awsInputsOf = (draft: AwsDraft) => ({
  credential:
    draft.type === KmsAwsCredentialType.AccessKey
      ? {
          type: KmsAwsCredentialType.AccessKey as const,
          data: { accessKey: draft.accessKey, secretKey: draft.secretKey }
        }
      : {
          type: KmsAwsCredentialType.AssumeRole as const,
          data: {
            assumeRoleArn: draft.assumeRoleArn,
            externalId: draft.externalId.trim() || undefined
          }
        },
  awsRegion: draft.awsRegion,
  kmsKeyId: draft.kmsKeyId.trim() || undefined
});

export const AwsKmsForm = ({
  ref,
  kms,
  mode,
  onBack,
  onCancel,
  onDone,
  onPendingChange
}: KmsFormProps) => {
  const adapter = useV4Adapter("orgSettings");
  const add = adapter.useAddExternalKms();
  const update = adapter.useUpdateExternalKms();
  const formId = useId();
  const [initial] = useState(() => awsDraftOf(kms));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const showDetails = mode !== "credentials";
  const showCredentials = mode !== "details";

  useImperativeHandle(ref, () => ({ dirty }), [dirty]);

  const edit = (patch: Partial<AwsDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const submit = async () => {
    const inputs = awsInputsOf(draft);
    let parsed;
    if (mode === "create")
      parsed = AddExternalKmsSchema.safeParse({
        name: draft.name,
        description: draft.description,
        configuration: { type: ExternalKmsProvider.Aws, inputs }
      });
    else if (mode === "details")
      parsed = UpdateExternalKmsSchema.safeParse({
        name: draft.name,
        description: draft.description
      });
    else parsed = ExternalKmsAwsSchema.safeParse(inputs);
    if (!parsed.success) {
      setErrors(issuesOf(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    onPendingChange(true);
    try {
      if (mode === "create")
        await add.mutateAsync({
          name: draft.name,
          description: draft.description,
          configuration: { type: ExternalKmsProvider.Aws, inputs }
        });
      else if (mode === "details" && kms)
        await update.mutateAsync({
          kmsId: kms.id,
          provider: ExternalKmsProvider.Aws,
          name: draft.name,
          description: draft.description
        });
      else if (kms)
        await update.mutateAsync({
          kmsId: kms.id,
          provider: ExternalKmsProvider.Aws,
          configuration: { type: ExternalKmsProvider.Aws, inputs }
        });
    } catch (error) {
      failed(
        kms ? "Failed to update AWS external KMS" : "Failed to create AWS external KMS",
        error
      );
      return;
    } finally {
      setPending(false);
      onPendingChange(false);
    }
    if (mode === "create") saved("AWS external KMS created");
    else
      saved(
        mode === "credentials"
          ? "AWS external KMS credentials updated"
          : "AWS external KMS details updated"
      );
    onDone();
  };

  return (
    <FormSheet
      provider={ExternalKmsProvider.Aws}
      mode={mode}
      formId={formId}
      pending={pending}
      dirty={dirty}
      onBack={onBack}
      onCancel={onCancel}
      onSubmit={submit}
    >
      {showDetails && (
        <DetailFields
          name={draft.name}
          description={draft.description}
          errors={errors}
          onName={(name) => edit({ name })}
          onDescription={(description) => edit({ description })}
        />
      )}
      {showCredentials && (
        <>
          <Field label="Authentication mode">
            <Select
              label="Authentication mode"
              value={draft.type}
              options={[
                { value: KmsAwsCredentialType.AssumeRole, label: "AWS assume role" },
                { value: KmsAwsCredentialType.AccessKey, label: "Access key" }
              ]}
              onChange={(type) =>
                edit({
                  type: type as KmsAwsCredentialType,
                  accessKey: "",
                  secretKey: "",
                  assumeRoleArn: "",
                  externalId: ""
                })
              }
            />
          </Field>
          {draft.type === KmsAwsCredentialType.AccessKey ? (
            <>
              <Field label="Access key ID" error={errors.accessKey}>
                <Input
                  mono
                  value={draft.accessKey}
                  invalid={Boolean(errors.accessKey)}
                  onChange={(event) => edit({ accessKey: event.target.value })}
                />
              </Field>
              <Field label="Secret access key" error={errors.secretKey}>
                <SecretInput
                  value={draft.secretKey}
                  invalid={Boolean(errors.secretKey)}
                  autoComplete="new-password"
                  onChange={(secretKey) => edit({ secretKey })}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="IAM role ARN" error={errors.assumeRoleArn}>
                <Input
                  mono
                  value={draft.assumeRoleArn}
                  invalid={Boolean(errors.assumeRoleArn)}
                  placeholder="arn:aws:iam::123456789012:role/InfisicalKms"
                  onChange={(event) => edit({ assumeRoleArn: event.target.value })}
                />
              </Field>
              <Field label="External ID" optional>
                <Input
                  mono
                  value={draft.externalId}
                  onChange={(event) => edit({ externalId: event.target.value })}
                />
              </Field>
            </>
          )}
          <Field label="AWS region" error={errors.awsRegion}>
            <Combobox
              label="AWS region"
              placeholder="Select an AWS region"
              value={draft.awsRegion}
              invalid={Boolean(errors.awsRegion)}
              options={AWS_REGIONS.map((region) => ({
                value: region.slug,
                label: region.name,
                meta: region.slug
              }))}
              onChange={(awsRegion) => edit({ awsRegion })}
            />
          </Field>
          <Field
            label="AWS KMS key ID"
            optional
            description="Leave blank to create a new AWS KMS key automatically."
          >
            <Input
              mono
              value={draft.kmsKeyId}
              onChange={(event) => edit({ kmsKeyId: event.target.value })}
            />
          </Field>
        </>
      )}
    </FormSheet>
  );
};

const keyLabel = (key: string) => {
  const parts = key.split("/");
  return `${parts[5]}/${parts[7]}`;
};

const readCredential = async (
  file: File
): Promise<{ credential?: ExternalKmsGcpCredentialSchemaType; error?: string }> => {
  if (file.size > GCP_CREDENTIAL_MAX_BYTES) return { error: "Max file size is 8 KB." };
  if (file.type && file.type !== "application/json")
    return { error: "Only .json files are accepted." };
  try {
    const parsed = ExternalKmsGcpCredentialSchema.safeParse(JSON.parse(await file.text()));
    return parsed.success
      ? { credential: parsed.data }
      : { error: "Invalid service account credential JSON." };
  } catch {
    return { error: "Invalid service account credential JSON." };
  }
};

const keyPlaceholderOf = ({
  loading,
  loaded,
  editing,
  count
}: {
  loading: boolean;
  loaded: boolean;
  editing: boolean;
  count: number;
}) => {
  if (loading) return "Loading keys in this region...";
  if (!loaded) return editing ? "Select a region to load keys" : "Upload a valid credential file";
  return count ? "Select a key" : "No keys found in this region";
};

const gcpErrorsOf = ({
  mode,
  name,
  description,
  region,
  file,
  credential,
  credentialError,
  keys,
  keyName
}: {
  mode: KmsFormMode;
  name: string;
  description: string;
  region: string;
  file?: File;
  credential?: ExternalKmsGcpCredentialSchemaType;
  credentialError?: string;
  keys: string[];
  keyName: string;
}): Errors => {
  const next: Errors = {};
  if (mode !== "credentials") {
    Object.assign(next, issuesOf(UpdateExternalKmsSchema.safeParse({ name, description }).error));
    if (!name.trim()) next.name = "Alias is required.";
  }
  if (mode === "details") return next;
  if (!region) next.region = "Select a GCP region.";
  if (mode === "create" && !credential)
    next.credential = credentialError ?? "Service account credential JSON is required.";
  if (file && !credential) next.credential = credentialError;
  if (!keys.includes(keyName)) next.keyName = "Select a valid key for the selected region.";
  return next;
};

const GCP_SAVED: Record<KmsFormMode, string> = {
  create: "GCP external KMS created",
  details: "GCP external KMS details updated",
  credentials: "GCP external KMS configuration updated"
};

const GCP_FAILED: Record<KmsFormMode, string> = {
  create: "Failed to create GCP external KMS",
  details: "Failed to update GCP external KMS",
  credentials: "Failed to update GCP external KMS"
};

type KeyLookup = { id: number; keys?: string[] };

const useGcpKeyLookup = ({
  kmsId,
  region,
  credential
}: {
  kmsId?: string;
  region: string;
  credential?: ExternalKmsGcpCredentialSchemaType;
}) => {
  const adapter = useV4Adapter("orgSettings");
  const fetchKeys = adapter.useFetchGcpKeys();
  const lookups = useRef(0);
  const [lookup, setLookup] = useState<KeyLookup>();
  const fromSaved = Boolean(kmsId && region && !credential);
  const savedKeys = adapter.useSavedGcpKeys(
    fromSaved && kmsId ? { kmsId, gcpRegion: region } : undefined
  );

  const load = async (nextRegion: string, nextCredential?: ExternalKmsGcpCredentialSchemaType) => {
    lookups.current += 1;
    const id = lookups.current;
    if (!nextRegion || !nextCredential) {
      setLookup(undefined);
      return;
    }
    setLookup({ id });
    const settle = (found: string[]) =>
      setLookup((current) => (current?.id === id ? { id, keys: found } : current));
    try {
      const result = await fetchKeys.mutateAsync({
        gcpRegion: nextRegion,
        credential: nextCredential
      });
      settle(result.keys);
    } catch (error) {
      if (id === lookups.current) failed("Failed to load GCP KMS keys", error);
      settle([]);
    }
  };

  if (fromSaved)
    return {
      keys: savedKeys.data?.keys ?? [],
      loading: savedKeys.isPending,
      loaded: Boolean(savedKeys.data),
      failed: Boolean(savedKeys.error),
      load
    };
  return {
    keys: lookup?.keys ?? [],
    loading: Boolean(lookup && !lookup.keys),
    loaded: Boolean(lookup?.keys),
    failed: false,
    load
  };
};

export const GcpKmsForm = ({
  ref,
  kms,
  mode,
  onBack,
  onCancel,
  onDone,
  onPendingChange
}: KmsFormProps) => {
  const adapter = useV4Adapter("orgSettings");
  const add = adapter.useAddExternalKms();
  const update = adapter.useUpdateExternalKms();
  const formId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const savedRegion: string = kms?.externalKms.configuration.gcpRegion ?? "";
  const savedKey: string = kms?.externalKms.configuration.keyName ?? "";
  const [name, setName] = useState(kms?.name ?? "");
  const [description, setDescription] = useState(kms?.description ?? "");
  const [region, setRegion] = useState(savedRegion);
  const [file, setFile] = useState<File>();
  const [credential, setCredential] = useState<ExternalKmsGcpCredentialSchemaType>();
  const [keyName, setKeyName] = useState(savedKey);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const showDetails = mode !== "credentials";
  const showCredentials = mode !== "details";
  const keyLookup = useGcpKeyLookup({
    kmsId: showCredentials ? kms?.id : undefined,
    region,
    credential
  });
  const { keys } = keyLookup;
  const dirty =
    name !== (kms?.name ?? "") ||
    description !== (kms?.description ?? "") ||
    region !== savedRegion ||
    keyName !== savedKey ||
    Boolean(file);

  useImperativeHandle(ref, () => ({ dirty }), [dirty]);

  const chooseRegion = (next: string) => {
    setRegion(next);
    setKeyName(next === savedRegion && !credential ? savedKey : "");
    keyLookup.load(next, credential);
  };

  const chooseFile = async (selected?: File) => {
    if (!selected) return;
    const result = await readCredential(selected);
    setFile(selected);
    setCredential(result.credential);
    setKeyName("");
    setErrors((current) => ({ ...current, credential: result.error }));
    keyLookup.load(region, result.credential);
  };

  const removeFile = () => {
    setFile(undefined);
    setCredential(undefined);
    setKeyName(region === savedRegion ? savedKey : "");
    setErrors((current) => ({ ...current, credential: undefined }));
    keyLookup.load(region);
  };

  const submit = async () => {
    const next = gcpErrorsOf({
      mode,
      name,
      description,
      region,
      file,
      credential,
      credentialError: errors.credential,
      keys,
      keyName
    });
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      return;
    }
    setErrors({});
    setPending(true);
    onPendingChange(true);
    try {
      if (mode === "create" && credential)
        await add.mutateAsync({
          name,
          description,
          configuration: {
            type: ExternalKmsProvider.Gcp,
            inputs: { gcpRegion: region, keyName, credential }
          }
        });
      else if (mode === "details" && kms)
        await update.mutateAsync({
          kmsId: kms.id,
          provider: ExternalKmsProvider.Gcp,
          name,
          description
        });
      else if (kms)
        await update.mutateAsync({
          kmsId: kms.id,
          provider: ExternalKmsProvider.Gcp,
          configuration: {
            type: ExternalKmsProvider.Gcp,
            inputs: { gcpRegion: region, keyName, ...(credential ? { credential } : {}) }
          }
        });
    } catch (error) {
      failed(GCP_FAILED[mode], error);
      return;
    } finally {
      setPending(false);
      onPendingChange(false);
    }
    saved(GCP_SAVED[mode]);
    onDone();
  };

  return (
    <FormSheet
      provider={ExternalKmsProvider.Gcp}
      mode={mode}
      formId={formId}
      pending={pending}
      dirty={dirty}
      onBack={onBack}
      onCancel={onCancel}
      onSubmit={submit}
    >
      {showDetails && (
        <DetailFields
          name={name}
          description={description}
          errors={errors}
          onName={setName}
          onDescription={setDescription}
        />
      )}
      {showCredentials && (
        <>
          <Field label="GCP region" error={errors.region}>
            <Combobox
              label="GCP region"
              placeholder="Select a GCP region"
              value={region}
              invalid={Boolean(errors.region)}
              options={GCP_REGIONS.map((entry) => ({
                value: entry.value,
                label: entry.label,
                meta: entry.value
              }))}
              onChange={chooseRegion}
            />
          </Field>
          <Field
            label="Service account credential JSON"
            optional={mode === "credentials"}
            error={errors.credential}
          >
            <Inline gap={8} align="center">
              <Button
                variant="outline"
                size="sm"
                icon="upload"
                onClick={() => fileInput.current?.click()}
              >
                {file ? "Choose another file" : "Choose file"}
              </Button>
              {file && <SmallText>{file.name}</SmallText>}
              {file && (
                <Button variant="ghost" size="sm" onClick={removeFile}>
                  Remove
                </Button>
              )}
              <input
                ref={fileInput}
                hidden
                type="file"
                accept=".json,application/json"
                aria-label="Service account credential JSON"
                onChange={(event) => {
                  const { currentTarget } = event;
                  chooseFile(currentTarget.files?.[0]);
                  currentTarget.value = "";
                }}
              />
            </Inline>
          </Field>
          <Field
            label="GCP key"
            error={
              errors.keyName ?? (keyLookup.failed ? "Failed to load GCP KMS keys." : undefined)
            }
          >
            <Combobox
              label="GCP key"
              placeholder={keyPlaceholderOf({
                loading: keyLookup.loading,
                loaded: keyLookup.loaded,
                editing: Boolean(kms),
                count: keys.length
              })}
              value={keyName}
              loading={keyLookup.loading}
              disabled={!keyLookup.loaded || !keys.length}
              invalid={Boolean(errors.keyName)}
              options={keys.map((key) => ({ value: key, label: keyLabel(key) }))}
              onChange={setKeyName}
            />
          </Field>
        </>
      )}
    </FormSheet>
  );
};
