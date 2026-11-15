import { type ReactNode, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { MultiStep, type MultiStepStep } from "@infisical/cipher/ui/multi-step";
import { RadioGroup, RadioGroupCard } from "@infisical/cipher/ui/radio-group";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { TagsInput } from "@infisical/cipher/ui/tags-input";
import { Textarea } from "@infisical/cipher/ui/textarea";
import axios from "axios";

import {
  buildCreateServiceRequest,
  buildUpdateServiceRequest,
  membersClearedNotice,
  type TMembersClearedNotice
} from "@app/components/agent-vault/service-sheet/serviceRequest";
import {
  buildServiceSchema,
  credentialLabel,
  hasDatabase,
  HTTP_CREDENTIAL_TYPES,
  HTTP_METHODS,
  isAllMethods,
  isPlainHttpUrl,
  MCP_SERVICE_STEP_FIELDS,
  NATIVE_CREDENTIAL_TYPES,
  NATIVE_SERVICE_STEP_FIELDS,
  SERVICE_STEP_FIELDS,
  SERVICE_TYPE_LABELS,
  serviceKindOf,
  ServiceStep,
  storedMemberFields,
  type TServiceForm,
  TRANSPORT_LABELS,
  UNCHANGED_SECRET
} from "@app/components/agent-vault/service-sheet/serviceSchema";
import { findVariableReferences, VARIABLE_KEY_RE } from "@app/helpers/agentVaultVariables";
import {
  AgentVaultCredentialType,
  AgentVaultMcpTransport,
  AgentVaultServiceType,
  AgentVaultVariableReferenceField,
  isNativeServiceType
} from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultMemberProvidedField,
  TAgentVaultService
} from "@app/hooks/api/agentVault/types";
import { ApiErrorTypes, type TApiErrors } from "@app/hooks/api/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { failed, readableFailure, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { NATIVE_SERVICE_META } from "./agent-vault-utils";
import { blankFormOf, formFromService } from "./service-form";
import { ServiceIcon } from "./shared";

const STEP_FIELDS = {
  http: SERVICE_STEP_FIELDS,
  mcp: MCP_SERVICE_STEP_FIELDS,
  native: NATIVE_SERVICE_STEP_FIELDS
};

const SERVICE_TYPES = [
  AgentVaultServiceType.Http,
  AgentVaultServiceType.Mcp,
  AgentVaultServiceType.Postgres,
  AgentVaultServiceType.Mysql,
  AgentVaultServiceType.Ssh
];

const NO_KEYS: ReadonlySet<string> = new Set();

const storedMemberProvided = (service: TAgentVaultService, field: TAgentVaultMemberProvidedField) =>
  storedMemberFields(service).includes(field);

type TErrors = Record<string, string | undefined>;

const StoredSecretInput = ({
  label,
  value,
  hasStored,
  invalid,
  multiline,
  onChange
}: {
  label: string;
  value: string | undefined;
  hasStored: boolean;
  invalid: boolean;
  multiline?: boolean;
  onChange: (value: string) => void;
}) => (
  <SecretInput
    aria-label={label}
    multiline={multiline}
    placeholder={hasStored ? "Leave blank to keep the current value" : undefined}
    value={value === UNCHANGED_SECRET ? "" : (value ?? "")}
    invalid={invalid}
    onChange={(next) => onChange(next === "" && hasStored ? UNCHANGED_SECRET : next)}
  />
);

const typeOptionMeta = (type: AgentVaultServiceType) => {
  if (type === AgentVaultServiceType.Http) return "Any REST or GraphQL API reached over HTTPS";
  if (type === AgentVaultServiceType.Mcp) return "A remote MCP server";
  if (type === AgentVaultServiceType.Ssh) return "A server agents reach over SSH";
  return `A ${SERVICE_TYPE_LABELS[type]} database`;
};

export const ServiceSheet = ({
  projectId,
  accessBundleId,
  service,
  onOpenChange
}: {
  projectId: string;
  accessBundleId?: string;
  service?: TAgentVaultService;
  onOpenChange: (open: boolean) => void;
}) => {
  const resources = useV4Adapter("agentVaultResources");
  const create = resources.useCreateService(projectId);
  const update = resources.useUpdateService(projectId);
  const isCreate = !service;
  const initial = useMemo(
    () => (service ? formFromService(service) : blankFormOf(AgentVaultServiceType.Http)),
    [service]
  );
  const [form, setForm] = useState<TServiceForm>(initial);
  const [errors, setErrors] = useState<TErrors>({});
  const [step, setStep] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const [notice, setNotice] = useState<TMembersClearedNotice | null>(null);
  const [saving, setSaving] = useState(false);
  const completed = useRef(false);

  const kind = serviceKindOf(form.serviceType);
  const nativeType = isNativeServiceType(form.serviceType) ? form.serviceType : null;
  const hasStoredHook = Boolean(service?.hook);

  const referencedKeys = useMemo(() => {
    const texts = [
      form.secret,
      form.username,
      ...form.customHeaders.map((header) => header.value),
      ...form.substitutions.map((substitution) => substitution.value)
    ];
    const keys = texts.flatMap((text) =>
      text && text !== UNCHANGED_SECRET ? findVariableReferences(text) : []
    );
    return [...new Set(keys.filter((key) => VARIABLE_KEY_RE.test(key)))].sort().join(",");
  }, [form.secret, form.username, form.customHeaders, form.substitutions]);
  const [debouncedKeys] = useDebounce(referencedKeys, 300);
  const { missing } = resources.useVariableKeyStatus(
    projectId,
    debouncedKeys ? debouncedKeys.split(",") : []
  );
  const schema = useMemo(
    () => buildServiceSchema(service, () => missing ?? NO_KEYS),
    [service, missing]
  );

  const dirty = step > 0 || JSON.stringify(form) !== JSON.stringify(initial);

  const set = <K extends keyof TServiceForm>(key: K, value: TServiceForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const memberProvides = (field: TAgentVaultMemberProvidedField) =>
    form.memberProvidedFields.includes(field);
  const toggleMemberProvided = (field: TAgentVaultMemberProvidedField, checked: boolean) => {
    set(
      "memberProvidedFields",
      checked
        ? [...form.memberProvidedFields, field]
        : form.memberProvidedFields.filter((entry) => entry !== field)
    );
    if (field === AgentVaultVariableReferenceField.CredentialValue && !checked) set("secret", "");
    if (field === AgentVaultVariableReferenceField.CredentialUsername && !checked)
      set("username", "");
  };

  const validateStep = (stepKey: ServiceStep) => {
    const fields = new Set<string>(STEP_FIELDS[kind][stepKey]);
    const result = schema.safeParse(form);
    const next: TErrors = {};
    if (!result.success)
      result.error.issues.forEach((issue) => {
        if (!fields.has(String(issue.path[0]))) return;
        const key = issue.path.join(".");
        next[key] = next[key] ?? issue.message;
      });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const close = () => {
    completed.current = false;
    onOpenChange(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (service) await update.mutateAsync(buildUpdateServiceRequest(service, form));
      else await create.mutateAsync(buildCreateServiceRequest(accessBundleId, form));
      saved(`Service ${form.name} ${isCreate ? "created" : "updated"}`);
      completed.current = true;
    } catch (error) {
      const response = axios.isAxiosError(error)
        ? (error.response?.data as TApiErrors | undefined)
        : undefined;
      if (response?.error === ApiErrorTypes.BadRequestError) {
        const details = response.details as { field?: string } | undefined;
        if (details?.field === "name") setErrors({ name: response.message });
        else if (response.message.includes("already covers"))
          setErrors({
            [kind === "mcp" ? "serverUrl" : "hosts"]: response.message
          });
      }
      readableFailure(`Failed to ${isCreate ? "create" : "update"} service`)(error);
    } finally {
      setSaving(false);
    }
  };

  const err = (key: string) => errors[key];

  const detailsContent: ReactNode = (() => {
    const nameAndDescription = (
      <>
        <Field
          label="Name"
          description={
            nativeType
              ? `Agents reach it at ${form.name || "<name>"}.svc.agent-vault.`
              : "Use lowercase letters, numbers, and hyphens."
          }
          error={err("name")}
          wide
        >
          <Input
            value={form.name}
            maxLength={64}
            invalid={Boolean(err("name"))}
            placeholder={nativeType ? "orders-db" : "github-api"}
            autoComplete="off"
            onChange={(event) => set("name", event.target.value)}
          />
        </Field>
        <Field
          label="Description"
          optional
          description="Agents read this to decide when to use the service."
          error={err("description")}
          wide
        >
          <Textarea
            rows={2}
            maxLength={256}
            value={form.description}
            aria-invalid={Boolean(err("description")) || undefined}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>
      </>
    );
    if (kind === "mcp")
      return (
        <Stack gap={16}>
          {nameAndDescription}
          <Field label="Server URL" error={err("serverUrl")} wide>
            <Input
              mono
              value={form.serverUrl}
              invalid={Boolean(err("serverUrl"))}
              placeholder="https://mcp.example.com/mcp"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => set("serverUrl", event.target.value)}
            />
          </Field>
          <Field label="Transport" error={err("transport")}>
            <Select
              label="Transport"
              value={form.transport}
              options={Object.values(AgentVaultMcpTransport).map((transport) => ({
                value: transport,
                label: TRANSPORT_LABELS[transport]
              }))}
              onChange={(next) => set("transport", next as AgentVaultMcpTransport)}
            />
          </Field>
        </Stack>
      );
    if (nativeType)
      return (
        <Stack gap={16}>
          {nameAndDescription}
          <Field label="Host" error={err("host")} wide>
            <Input
              mono
              value={form.host}
              invalid={Boolean(err("host"))}
              placeholder="db.internal.example.com"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => set("host", event.target.value)}
            />
          </Field>
          <Field label="Port" error={err("port")}>
            <Input
              mono
              inputMode="numeric"
              value={form.port}
              invalid={Boolean(err("port"))}
              onChange={(event) => set("port", event.target.value)}
            />
          </Field>
          {hasDatabase(form.serviceType) && (
            <>
              <Field label="Database" error={err("database")} wide>
                <Input
                  mono
                  value={form.database}
                  invalid={Boolean(err("database"))}
                  placeholder="orders"
                  autoComplete="off"
                  onChange={(event) => set("database", event.target.value)}
                />
              </Field>
              <Switch
                label="Use TLS"
                checked={form.tlsEnabled}
                onChange={(checked) => set("tlsEnabled", checked)}
              />
              {form.tlsEnabled && (
                <>
                  <Switch
                    label="Verify the server certificate"
                    checked={form.tlsVerify}
                    onChange={(checked) => set("tlsVerify", checked)}
                  />
                  <Field
                    label="CA certificate"
                    optional
                    description="PEM. Leave blank to trust the system certificate authorities."
                    error={err("tlsCa")}
                    wide
                  >
                    <Textarea
                      mono
                      rows={4}
                      value={form.tlsCa}
                      aria-invalid={Boolean(err("tlsCa")) || undefined}
                      onChange={(event) => set("tlsCa", event.target.value)}
                    />
                  </Field>
                </>
              )}
            </>
          )}
        </Stack>
      );
    return (
      <Stack gap={16}>
        {nameAndDescription}
        <Field
          label="Hosts"
          description="Press Enter after each host. Use *.example.com for every subdomain."
          error={err("hosts") ?? err("hostDraft")}
          wide
        >
          <TagsInput
            label="Hosts"
            mono
            value={form.hosts}
            invalid={Boolean(err("hosts") ?? err("hostDraft"))}
            placeholder="api.example.com"
            onChange={(hosts) => set("hosts", hosts)}
          />
        </Field>
        <Field label="Allowed methods" error={err("methods")} wide>
          <MultiSelect
            label="Allowed methods"
            allLabel="All methods"
            options={HTTP_METHODS.map((method) => ({
              value: method,
              label: method
            }))}
            value={form.methods}
            invalid={Boolean(err("methods"))}
            onChange={(methods) => set("methods", methods as TServiceForm["methods"])}
          />
        </Field>
        <Field
          label="Allowed path prefixes"
          optional
          description="Leave empty to allow every path."
          error={err("pathPrefixes") ?? err("pathDraft")}
          wide
        >
          <TagsInput
            label="Allowed path prefixes"
            mono
            value={form.pathPrefixes}
            invalid={Boolean(err("pathPrefixes") ?? err("pathDraft"))}
            placeholder="/v1/"
            onChange={(prefixes) => set("pathPrefixes", prefixes)}
          />
        </Field>
      </Stack>
    );
  })();

  const credentialTypes = (() => {
    if (nativeType) return NATIVE_CREDENTIAL_TYPES[nativeType];
    if (kind === "mcp") return [AgentVaultCredentialType.Bearer];
    return HTTP_CREDENTIAL_TYPES;
  })();
  const secretLabel = form.credentialType === AgentVaultCredentialType.Basic ? "Password" : "Token";
  const hasStoredSecret =
    Boolean(service) &&
    service?.credential.type === form.credentialType &&
    !storedMemberProvided(service, AgentVaultVariableReferenceField.CredentialValue);
  const hasStoredUsername =
    Boolean(service) &&
    service?.credential.type === form.credentialType &&
    !storedMemberProvided(service, AgentVaultVariableReferenceField.CredentialUsername);

  const credentialContent = (
    <Stack gap={16}>
      {credentialTypes.length > 1 && (
        <Field label="Credential" error={err("credentialType")}>
          <Select
            label="Credential"
            value={form.credentialType}
            options={credentialTypes.map((type) => ({
              value: type,
              label: credentialLabel(form.serviceType, type)
            }))}
            onChange={(next) => {
              const type = next as AgentVaultCredentialType;
              setForm((current) => ({
                ...current,
                credentialType: type,
                secret: service?.credential.type === type ? formFromService(service).secret : "",
                username: service?.credential.type === type ? formFromService(service).username : ""
              }));
              setErrors({});
            }}
          />
        </Field>
      )}
      {form.credentialType === AgentVaultCredentialType.Passthrough && (
        <Field label="Pass-through">
          <span>The proxy sends requests as the agent made them, with no credential added.</span>
        </Field>
      )}
      {form.credentialType === AgentVaultCredentialType.Bearer && (
        <>
          <Field label="Header name" error={err("headerName")}>
            <Input
              mono
              value={form.headerName ?? ""}
              invalid={Boolean(err("headerName"))}
              onChange={(event) => set("headerName", event.target.value)}
            />
          </Field>
          <Field label="Prefix" optional error={err("headerPrefix")}>
            <Input
              mono
              value={form.headerPrefix ?? ""}
              invalid={Boolean(err("headerPrefix"))}
              onChange={(event) => set("headerPrefix", event.target.value)}
            />
          </Field>
        </>
      )}
      {(form.credentialType === AgentVaultCredentialType.Basic ||
        form.credentialType === AgentVaultCredentialType.SshKey) && (
        <>
          <Switch
            label="Each member enters their own username"
            checked={memberProvides(AgentVaultVariableReferenceField.CredentialUsername)}
            disabled={form.credentialType === AgentVaultCredentialType.SshKey}
            onChange={(checked) =>
              toggleMemberProvided(AgentVaultVariableReferenceField.CredentialUsername, checked)
            }
          />
          {!memberProvides(AgentVaultVariableReferenceField.CredentialUsername) && (
            <Field label="Username" error={err("username")} wide>
              <StoredSecretInput
                label="Username"
                value={form.username}
                hasStored={hasStoredUsername}
                invalid={Boolean(err("username"))}
                onChange={(value) => set("username", value)}
              />
            </Field>
          )}
        </>
      )}
      {form.credentialType === AgentVaultCredentialType.SshKey && (
        <>
          <Field label="Private key" error={err("sshPrivateKey")} wide>
            <StoredSecretInput
              label="Private key"
              multiline
              value={form.sshPrivateKey}
              hasStored={service?.credential.type === AgentVaultCredentialType.SshKey}
              invalid={Boolean(err("sshPrivateKey"))}
              onChange={(value) => set("sshPrivateKey", value)}
            />
          </Field>
          <Field label="Certificate" optional error={err("sshCertificate")} wide>
            <StoredSecretInput
              label="Certificate"
              multiline
              value={form.sshCertificate}
              hasStored={
                service?.credential.type === AgentVaultCredentialType.SshKey &&
                service.credential.hasCertificate
              }
              invalid={Boolean(err("sshCertificate"))}
              onChange={(value) => set("sshCertificate", value)}
            />
          </Field>
        </>
      )}
      {(form.credentialType === AgentVaultCredentialType.Bearer ||
        form.credentialType === AgentVaultCredentialType.Basic) && (
        <>
          <Switch
            label={`Each member enters their own ${secretLabel.toLowerCase()}`}
            checked={memberProvides(AgentVaultVariableReferenceField.CredentialValue)}
            onChange={(checked) =>
              toggleMemberProvided(AgentVaultVariableReferenceField.CredentialValue, checked)
            }
          />
          {!memberProvides(AgentVaultVariableReferenceField.CredentialValue) && (
            <Field
              label={secretLabel}
              description="Paste the value, or reference a variable as {{KEY}}."
              error={err("secret")}
              wide
            >
              <StoredSecretInput
                label={secretLabel}
                value={form.secret}
                hasStored={hasStoredSecret}
                invalid={Boolean(err("secret"))}
                onChange={(value) => set("secret", value)}
              />
            </Field>
          )}
        </>
      )}
    </Stack>
  );

  const hookContent = (
    <Stack gap={16}>
      <Switch
        label="Use a hook"
        description="Your server allows or refuses what agents send before the proxy adds the credential."
        checked={form.hookEnabled}
        onChange={(checked) => {
          set("hookEnabled", checked);
          if (!checked) setErrors({});
        }}
      />
      {form.hookEnabled && (
        <>
          <Field
            label="Hook URL"
            description={
              isPlainHttpUrl(form.hookUrl)
                ? "Requests and answers are sent unencrypted over http://."
                : undefined
            }
            error={err("hookUrl")}
            wide
          >
            <Input
              mono
              value={form.hookUrl}
              invalid={Boolean(err("hookUrl"))}
              placeholder="https://hooks.example.com/agent-vault"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => set("hookUrl", event.target.value)}
            />
          </Field>
          <Field
            label="Signing secret"
            description={
              hasStoredHook &&
              form.hookSigningSecret !== UNCHANGED_SECRET &&
              form.hookSigningSecret !== ""
                ? "Proxies switch to the new secret on their next check-in."
                : "At least 32 characters."
            }
            error={err("hookSigningSecret")}
            wide
          >
            <StoredSecretInput
              label="Signing secret"
              value={form.hookSigningSecret}
              hasStored={hasStoredHook}
              invalid={Boolean(err("hookSigningSecret"))}
              onChange={(value) => set("hookSigningSecret", value)}
            />
          </Field>
        </>
      )}
    </Stack>
  );

  const reviewTarget = (() => {
    if (kind === "mcp") return form.serverUrl;
    if (nativeType)
      return (
        [form.host, form.port].filter(Boolean).join(":") +
        (form.database ? `/${form.database}` : "")
      );
    return form.hosts.join(", ");
  })();
  const credentialSummary = (() => {
    const label = credentialLabel(form.serviceType, form.credentialType);
    return form.memberProvidedFields.length ? `${label}, entered by each member` : label;
  })();

  const reviewContent = (
    <DataList
      variant="props"
      items={[
        ["Type", SERVICE_TYPE_LABELS[form.serviceType]],
        ["Name", form.name],
        ...(form.description.trim()
          ? [["Description", form.description.trim()] as [string, string]]
          : []),
        [kind === "mcp" ? "Server URL" : "Target", reviewTarget || "-"],
        ...(kind === "http"
          ? [
              ["Methods", isAllMethods(form.methods) ? "All methods" : form.methods.join(", ")] as [
                string,
                string
              ],
              [
                "Path prefixes",
                form.pathPrefixes.length ? form.pathPrefixes.join(", ") : "Every path"
              ] as [string, string]
            ]
          : []),
        ["Credential", credentialSummary],
        ["Hook", form.hookEnabled ? form.hookUrl : "Off"]
      ]}
    />
  );

  const typeStep: MultiStepStep = {
    title: "Type",
    summary: SERVICE_TYPE_LABELS[form.serviceType],
    render: ({ next }) => (
      <RadioGroup
        aria-label="Service type"
        value={form.serviceType}
        onValueChange={(value) => {
          const type = value as AgentVaultServiceType;
          if (type !== form.serviceType) {
            setForm(blankFormOf(type));
            setErrors({});
          }
          next();
        }}
      >
        {SERVICE_TYPES.map((type) => (
          <RadioGroupCard
            key={type}
            value={type}
            title={SERVICE_TYPE_LABELS[type]}
            description={typeOptionMeta(type)}
            media={
              <ServiceIcon
                serviceType={type}
                hostPattern={isNativeServiceType(type) ? null : undefined}
              />
            }
          />
        ))}
      </RadioGroup>
    )
  };

  const steps: MultiStepStep[] = [
    ...(isCreate ? [typeStep] : []),
    {
      title: "Details",
      summary: form.name || undefined,
      validate: () => validateStep(ServiceStep.Details),
      content: detailsContent
    },
    {
      title: "Credential",
      summary: credentialLabel(form.serviceType, form.credentialType),
      validate: () => validateStep(ServiceStep.Credential),
      content: credentialContent
    },
    {
      title: "Hook",
      summary: form.hookEnabled ? "On" : "Off",
      validate: () => validateStep(ServiceStep.Hook),
      content: hookContent
    },
    {
      title: "Review",
      validate: () => {
        const pending = membersClearedNotice(form, service);
        if (!pending) return true;
        setNotice(pending);
        return false;
      },
      content: reviewContent
    }
  ];

  const title = (() => {
    if (service) return `Edit ${service.name}`;
    return nativeType ? `Add ${NATIVE_SERVICE_META[nativeType].label} service` : "Add service";
  })();

  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title={title}
        open
        step={step}
        onStepChange={setStep}
        onOpenChange={(next) => {
          if (next) return;
          if (completed.current || !dirty) {
            close();
            return;
          }
          setDiscarding(true);
        }}
        completeLabel={isCreate ? "Add service" : "Save"}
        onComplete={save}
        steps={steps}
      />
      <DiscardChangesAlertDialog open={discarding} onOpenChange={setDiscarding} onDiscard={close} />
      <AlertDialog
        open={Boolean(notice)}
        onOpenChange={(open) => !open && !saving && setNotice(null)}
      >
        <AlertDialogContent tone="danger" pending={saving}>
          <AlertDialogHeader>
            <AlertDialogTitle>{notice?.title}</AlertDialogTitle>
            <AlertDialogDescription>{notice?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                try {
                  await save();
                  setNotice(null);
                  close();
                } catch (error) {
                  failed("Failed to save service", error);
                  setNotice(null);
                }
              }}
            >
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
