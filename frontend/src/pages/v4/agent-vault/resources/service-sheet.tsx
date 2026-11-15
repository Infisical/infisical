import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Inline, InlineGrow, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { MultiStep, type MultiStepStep } from "@infisical/cipher/ui/multi-step";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { Select } from "@infisical/cipher/ui/select";
import { Separator } from "@infisical/cipher/ui/separator";
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
  HOOK_SIGNING_SECRET_REQUIRED_MESSAGE,
  HTTP_CREDENTIAL_TYPES,
  HTTP_METHODS,
  isAllMethods,
  isCredentialMemberProvided,
  isOAuthAuthorizationMissing,
  isPlainHttpUrl,
  MCP_SERVICE_STEP_FIELDS,
  McpToolScope,
  NATIVE_CREDENTIAL_TYPES,
  NATIVE_SERVICE_STEP_FIELDS,
  OAUTH_OWN_APP_REQUIRED_ERROR,
  oauthStatusLabel,
  SERVICE_STEP_FIELDS,
  SERVICE_TYPE_LABELS,
  serviceKindOf,
  ServiceStep,
  storedMemberFields,
  type TServiceForm,
  TRANSPORT_LABELS,
  UNCHANGED_SECRET
} from "@app/components/agent-vault/service-sheet/serviceSchema";
import type { AgentVaultTemplate } from "@app/helpers/agentVaultTemplates";
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
import { serverMessage } from "./oauth";
import {
  blankFormOf,
  formFromService,
  formFromTemplate,
  type TServiceErrors,
  type TServiceFormApi
} from "./service-form";
import { CustomHeaderFields, SubstitutionFields } from "./service-headers";
import { OAuthAuthorizeCard } from "./service-oauth";
import { ServiceTemplatePicker } from "./service-templates";
import { McpToolsFields, type TLoadedMcpTools } from "./service-tools";
import { VariableSecretInput } from "./variable-input";

const STEP_FIELDS = {
  http: SERVICE_STEP_FIELDS,
  mcp: MCP_SERVICE_STEP_FIELDS,
  native: NATIVE_SERVICE_STEP_FIELDS
};

const NO_KEYS: ReadonlySet<string> = new Set();

const MEMBER_FIELDS_OF_TYPE: Record<AgentVaultCredentialType, TAgentVaultMemberProvidedField[]> = {
  [AgentVaultCredentialType.Bearer]: [AgentVaultVariableReferenceField.CredentialValue],
  [AgentVaultCredentialType.Basic]: [
    AgentVaultVariableReferenceField.CredentialUsername,
    AgentVaultVariableReferenceField.CredentialValue
  ],
  [AgentVaultCredentialType.Passthrough]: [],
  [AgentVaultCredentialType.OAuth]: [AgentVaultVariableReferenceField.CredentialValue],
  [AgentVaultCredentialType.SshKey]: []
};

const NATIVE_FIELD_OF_CONFIG_ERROR: [string, keyof TServiceForm][] = [
  ["'host'", "host"],
  ["'port'", "port"],
  ["'database'", "database"],
  ["'tls.ca'", "tlsCa"]
];

// The server keeps a completed authorization for 10 minutes. Expiring it here a little early covers the poll that
// delivered it, so the sheet never offers one the server has already dropped.
const OAUTH_AUTHORIZATION_LIFETIME_MS = (10 * 60 - 30) * 1000;
const OAUTH_AUTHORIZATION_EXPIRED_MESSAGE =
  "This authorization expired before the service was saved. Authorize again.";

const storedMemberProvided = (service: TAgentVaultService, field: TAgentVaultMemberProvidedField) =>
  storedMemberFields(service).includes(field);

// A successful save consumes the authorization and a failed one restores it, so these refusals mean it expired,
// another save used it, or it can't be used for this service. Only authorizing again gets past any of them.
const rejectedAuthorizationMessage = (error: unknown) => {
  if (!axios.isAxiosError<{ message?: unknown }>(error)) return null;
  const status = error.response?.status;
  const message = error.response?.data?.message;
  if (typeof message !== "string") return null;
  const isRejected =
    (status === 400 && message.startsWith("This authorization ")) ||
    (status === 404 && message.startsWith("Authorization with ID")) ||
    (status === 409 && message.includes("already used by another save"));
  return isRejected ? message : null;
};

const isMemberOAuthSetupError = (error: unknown) =>
  axios.isAxiosError<{ details?: { oauthSetup?: unknown } }>(error) &&
  error.response?.status === 400 &&
  error.response.data?.details?.oauthSetup === true;

const isRegistrationRequired = (error: unknown) =>
  axios.isAxiosError<{ details?: { registrationRequired?: unknown } }>(error) &&
  error.response?.data?.details?.registrationRequired === true;

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
  const [errors, setErrors] = useState<TServiceErrors>({});
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<AgentVaultTemplate | null>(null);
  const [picked, setPicked] = useState(!isCreate);
  const [discarding, setDiscarding] = useState(false);
  const [notice, setNotice] = useState<TMembersClearedNotice | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [loadedTools, setLoadedTools] = useState<TLoadedMcpTools | null>(null);
  const completed = useRef(false);

  const kind = serviceKindOf(form.serviceType);
  const isMcp = kind === "mcp";
  const nativeType = isNativeServiceType(form.serviceType) ? form.serviceType : null;
  const hasStoredHook = Boolean(service?.hook);
  const isMemberProvided = isCredentialMemberProvided(form);

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

  const dirty = (isCreate && picked) || JSON.stringify(form) !== JSON.stringify(initial);

  const set = useCallback(<K extends keyof TServiceForm>(key: K, value: TServiceForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }, []);
  const patch = useCallback((values: Partial<TServiceForm>) => {
    setForm((current) => ({ ...current, ...values }));
    setErrors((current) => {
      const next = { ...current };
      Object.keys(values).forEach((key) => {
        next[key] = undefined;
      });
      return next;
    });
  }, []);
  const err = (key: string) => errors[key];
  const api: TServiceFormApi = { form, set, patch, err, setErrors };

  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  });

  useEffect(() => {
    if (!form.oauthAuthorizationId) return undefined;
    const timeout = window.setTimeout(() => {
      const isOAuth = formRef.current.credentialType === AgentVaultCredentialType.OAuth;
      setForm((current) => ({
        ...current,
        oauthAuthorizationId: "",
        oauthAuthorizationRejection: isOAuth
          ? OAUTH_AUTHORIZATION_EXPIRED_MESSAGE
          : current.oauthAuthorizationRejection
      }));
      if (isOAuth)
        setErrors((current) => ({
          ...current,
          oauthAuthorizationId: OAUTH_AUTHORIZATION_EXPIRED_MESSAGE
        }));
    }, OAUTH_AUTHORIZATION_LIFETIME_MS);
    return () => window.clearTimeout(timeout);
  }, [form.oauthAuthorizationId]);

  const memberProvides = (field: TAgentVaultMemberProvidedField) =>
    form.memberProvidedFields.includes(field);
  const toggleMemberProvided = (field: TAgentVaultMemberProvidedField, checked: boolean) => {
    const hasStoredSecret =
      service?.credential.type === form.credentialType &&
      !storedMemberProvided(service, AgentVaultVariableReferenceField.CredentialValue);
    patch({
      memberProvidedFields: checked
        ? [...form.memberProvidedFields, field]
        : form.memberProvidedFields.filter((entry) => entry !== field),
      ...(field === AgentVaultVariableReferenceField.CredentialValue && {
        secret: !checked && hasStoredSecret ? UNCHANGED_SECRET : ""
      }),
      ...(field === AgentVaultVariableReferenceField.CredentialUsername &&
        !checked && {
          username: ""
        })
    });
  };

  const selectCredentialType = (type: AgentVaultCredentialType) => {
    if (type === form.credentialType) return;
    const stored = service?.credential.type === type ? formFromService(service) : null;
    setForm((current) => ({
      ...current,
      credentialType: type,
      secret: stored ? stored.secret : "",
      username: stored ? stored.username : "",
      memberProvidedFields:
        stored && service
          ? storedMemberFields(service)
          : current.memberProvidedFields.filter((field) =>
              MEMBER_FIELDS_OF_TYPE[type].includes(field)
            )
    }));
    setErrors({});
  };

  const stepKeys = [
    ...(isCreate ? [ServiceStep.Template] : []),
    ServiceStep.Details,
    ServiceStep.Credential,
    ...(isMcp ? [ServiceStep.Tools] : []),
    ServiceStep.Hook,
    ServiceStep.Review
  ];
  const goTo = (key: ServiceStep) => {
    const index = stepKeys.indexOf(key);
    if (index !== -1) setStep(index);
  };

  const validateStep = (stepKey: ServiceStep) => {
    const fields = new Set<string>(STEP_FIELDS[kind][stepKey]);
    const result = schema.safeParse(form);
    const next: TServiceErrors = {};
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

  // Returns false when the refusal belongs to a field, which then shows it on the step that holds it.
  const showSaveError = (error: unknown) => {
    const response = axios.isAxiosError(error)
      ? (error.response?.data as TApiErrors | undefined)
      : undefined;
    const isBadRequest = response?.error === ApiErrorTypes.BadRequestError;
    const message = isBadRequest && typeof response.message === "string" ? response.message : "";

    if (isBadRequest && (response.details as { field?: string } | undefined)?.field === "name") {
      setErrors({ name: message });
      goTo(ServiceStep.Details);
      return false;
    }
    if (isBadRequest && message.includes("already covers")) {
      setErrors({ [isMcp ? "serverUrl" : "hosts"]: message });
      goTo(ServiceStep.Details);
      return false;
    }

    const isMemberOAuthSave =
      isMcp && form.credentialType === AgentVaultCredentialType.OAuth && isMemberProvided;
    const isOwnAppRequired = isMemberOAuthSave && isRegistrationRequired(error);
    const memberSetupError =
      isOwnAppRequired || (isMemberOAuthSave && isMemberOAuthSetupError(error))
        ? serverMessage(error)
        : null;
    if (memberSetupError) {
      setErrors({
        oauthAuthorizationId: memberSetupError,
        ...(isOwnAppRequired && { [OAUTH_OWN_APP_REQUIRED_ERROR]: "true" })
      });
      goTo(ServiceStep.Credential);
      return false;
    }

    const rejection =
      isMcp && form.credentialType === AgentVaultCredentialType.OAuth
        ? rejectedAuthorizationMessage(error)
        : null;
    if (rejection) {
      patch({ oauthAuthorizationId: "", oauthAuthorizationRejection: rejection });
      setErrors({ oauthAuthorizationId: rejection });
      goTo(ServiceStep.Credential);
      return false;
    }

    if (isBadRequest && message.includes("needs a username")) {
      setErrors({ username: message });
      goTo(ServiceStep.Credential);
      return false;
    }

    const nativeField =
      isBadRequest && nativeType
        ? NATIVE_FIELD_OF_CONFIG_ERROR.find(([prefix]) => message.startsWith(`${prefix}: `))
        : undefined;
    if (nativeField) {
      const [prefix, field] = nativeField;
      setErrors({ [field]: message.slice(prefix.length + 2) });
      goTo(ServiceStep.Details);
      return false;
    }

    if (isBadRequest && message === HOOK_SIGNING_SECRET_REQUIRED_MESSAGE) {
      setErrors({ hookSigningSecret: message });
      goTo(ServiceStep.Hook);
      return false;
    }
    return true;
  };

  const save = async () => {
    setSaving(true);
    try {
      if (service) await update.mutateAsync(buildUpdateServiceRequest(service, form));
      else await create.mutateAsync(buildCreateServiceRequest(accessBundleId, form));
      saved(`Service ${form.name} ${isCreate ? "created" : "updated"}`);
      completed.current = true;
      return true;
    } catch (error) {
      if (!showSaveError(error)) return false;
      return readableFailure(`Failed to ${isCreate ? "create" : "update"} service`)(error);
    } finally {
      setSaving(false);
    }
  };

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

  const detailsContent: ReactNode = (() => {
    if (isMcp)
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
            placeholder={form.hostDraft || "api.example.com"}
            onChange={(hosts) => patch({ hosts, hostDraft: "" })}
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
    if (isMcp) return [AgentVaultCredentialType.OAuth, AgentVaultCredentialType.Bearer];
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
  const isBearer = form.credentialType === AgentVaultCredentialType.Bearer;
  const variableField = (
    key: "secret" | "username",
    label: string,
    hasStored: boolean,
    allowsVariables = true
  ) => (
    <Field
      label={label}
      description={allowsVariables ? "Paste the value, or type {{ to use a variable." : undefined}
      error={err(key)}
      wide
    >
      <VariableSecretInput
        projectId={projectId}
        label={label}
        value={form[key]}
        hasStored={hasStored}
        allowsVariables={allowsVariables}
        invalid={Boolean(err(key))}
        onChange={(value) => set(key, value)}
      />
    </Field>
  );

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
            onChange={(next) => selectCredentialType(next as AgentVaultCredentialType)}
          />
        </Field>
      )}
      {isMcp && form.credentialType === AgentVaultCredentialType.OAuth && (
        <OAuthAuthorizeCard
          projectId={projectId}
          service={service}
          api={api}
          onWaitingChange={setSigningIn}
        />
      )}
      {form.credentialType === AgentVaultCredentialType.Passthrough && (
        <Field label="Pass-through">
          <span>The proxy sends requests as the agent made them, with no credential added.</span>
        </Field>
      )}
      {isBearer && (
        <Inline gap={12} align="start">
          <InlineGrow>
            <Field label="Header name" error={err("headerName")}>
              <Input
                mono
                value={form.headerName ?? ""}
                invalid={Boolean(err("headerName"))}
                placeholder="Authorization"
                onChange={(event) => set("headerName", event.target.value)}
              />
            </Field>
          </InlineGrow>
          <Field label="Prefix" optional error={err("headerPrefix")}>
            <Input
              mono
              width="md"
              value={form.headerPrefix ?? ""}
              invalid={Boolean(err("headerPrefix"))}
              placeholder="Bearer"
              onChange={(event) => set("headerPrefix", event.target.value)}
            />
          </Field>
        </Inline>
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
          {!memberProvides(AgentVaultVariableReferenceField.CredentialUsername) &&
            variableField(
              "username",
              "Username",
              hasStoredUsername,
              form.credentialType !== AgentVaultCredentialType.SshKey
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
      {(isBearer || form.credentialType === AgentVaultCredentialType.Basic) && (
        <>
          <Switch
            label={`Each member enters their own ${secretLabel.toLowerCase()}`}
            checked={memberProvides(AgentVaultVariableReferenceField.CredentialValue)}
            onChange={(checked) =>
              toggleMemberProvided(AgentVaultVariableReferenceField.CredentialValue, checked)
            }
          />
          {!memberProvides(AgentVaultVariableReferenceField.CredentialValue) &&
            variableField("secret", secretLabel, hasStoredSecret)}
        </>
      )}
      {!nativeType && (
        <>
          <Separator />
          <CustomHeaderFields projectId={projectId} api={api} />
          {kind === "http" && <SubstitutionFields projectId={projectId} api={api} />}
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
    if (isMcp) return form.serverUrl;
    if (nativeType)
      return (
        [form.host, form.port].filter(Boolean).join(":") +
        (form.database ? `/${form.database}` : "")
      );
    return form.hosts.join(", ");
  })();
  const credentialSummary = (() => {
    if (isMcp && form.credentialType === AgentVaultCredentialType.OAuth)
      return `OAuth, ${oauthStatusLabel(form, service).toLowerCase()}`;
    const label = credentialLabel(form.serviceType, form.credentialType);
    return form.memberProvidedFields.length ? `${label}, entered by each member` : label;
  })();
  const toolsSummary =
    form.toolScope === McpToolScope.All ? "All tools" : `${form.allowedTools.length} selected`;

  const reviewItems: [string, string][] = [
    ["Type", SERVICE_TYPE_LABELS[form.serviceType]],
    ["Name", form.name],
    ...(form.description.trim()
      ? [["Description", form.description.trim()] as [string, string]]
      : []),
    [isMcp ? "Server URL" : "Target", reviewTarget || "-"],
    ...(kind === "http"
      ? ([
          ["Methods", isAllMethods(form.methods) ? "All methods" : form.methods.join(", ")],
          ["Path prefixes", form.pathPrefixes.length ? form.pathPrefixes.join(", ") : "Every path"]
        ] as [string, string][])
      : []),
    ["Credential", credentialSummary],
    ...(isMcp ? [["Tools", toolsSummary] as [string, string]] : []),
    ...(form.customHeaders.length
      ? [
          ["Custom headers", form.customHeaders.map((header) => header.name).join(", ")] as [
            string,
            string
          ]
        ]
      : []),
    ...(form.substitutions.length
      ? [
          [
            "Substitutions",
            form.substitutions.map((substitution) => substitution.placeholder).join(", ")
          ] as [string, string]
        ]
      : []),
    ["Hook", form.hookEnabled ? form.hookUrl : "Off"]
  ];

  const isAuthorizationMissing = isOAuthAuthorizationMissing(form, service);
  const isAuthorizationRejected =
    isMcp &&
    form.credentialType === AgentVaultCredentialType.OAuth &&
    !isMemberProvided &&
    Boolean(form.oauthAuthorizationRejection);
  const signingInReason = signingIn ? "Finish or cancel signing in first." : undefined;

  const customName = (() => {
    if (nativeType) return NATIVE_SERVICE_META[nativeType].label;
    return isMcp ? "Custom MCP server" : "Custom HTTP API";
  })();

  const templateStep: MultiStepStep = {
    title: "Template",
    summary: picked ? (template?.name ?? customName) : undefined,
    render: ({ next }) => (
      <ServiceTemplatePicker
        onSelect={(choice, serviceType) => {
          setTemplate(choice);
          setForm(formFromTemplate(choice, serviceType));
          setErrors({});
          setLoadedTools(null);
          setPicked(true);
          next();
        }}
      />
    )
  };

  const steps: MultiStepStep[] = [
    ...(isCreate ? [templateStep] : []),
    {
      title: "Details",
      summary: form.name || undefined,
      validate: () => validateStep(ServiceStep.Details),
      content: detailsContent
    },
    {
      title: "Credential",
      summary: isAuthorizationRejected
        ? "Authorize again"
        : credentialLabel(form.serviceType, form.credentialType),
      validate: () => validateStep(ServiceStep.Credential),
      disabledReason:
        signingInReason ?? (isAuthorizationMissing ? "Authorize the service first." : undefined),
      content: credentialContent
    },
    ...(isMcp
      ? [
          {
            title: "Tools",
            summary: toolsSummary,
            validate: () => validateStep(ServiceStep.Tools),
            disabledReason: signingInReason,
            content: (
              <McpToolsFields
                projectId={projectId}
                service={service}
                api={api}
                loaded={loadedTools}
                onLoaded={setLoadedTools}
                isAuthorizationExpired={isAuthorizationRejected}
                isCredentialMemberProvided={isMemberProvided}
                onGoToDetails={() => goTo(ServiceStep.Details)}
                onGoToCredential={() => goTo(ServiceStep.Credential)}
                onWaitingChange={setSigningIn}
              />
            )
          }
        ]
      : []),
    {
      title: "Hook",
      summary: form.hookEnabled ? "On" : "Off",
      validate: () => validateStep(ServiceStep.Hook),
      content: hookContent
    },
    {
      title: "Review",
      validate: async () => {
        const pending = membersClearedNotice(form, service);
        if (pending) {
          setNotice(pending);
          return false;
        }
        return save();
      },
      content: <DataList variant="props" items={reviewItems} />
    }
  ];

  const title = (() => {
    if (service) return `Edit ${service.name}`;
    if (!picked) return "Add service";
    return `Add ${template?.name ?? customName}`;
  })();

  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title={title}
        open
        step={step}
        onStepChange={(next) => {
          if (isCreate && next === 0) setPicked(false);
          setStep(next);
        }}
        onOpenChange={(next) => {
          if (next) return;
          if (completed.current || !dirty) {
            close();
            return;
          }
          setDiscarding(true);
        }}
        completeLabel={isCreate ? "Add service" : "Save"}
        onComplete={() => undefined}
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
                  const done = await save();
                  setNotice(null);
                  if (done) close();
                } catch (error) {
                  setNotice(null);
                  failed(`Failed to ${isCreate ? "create" : "update"} service`, error);
                }
              }}
            >
              Remove and save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
