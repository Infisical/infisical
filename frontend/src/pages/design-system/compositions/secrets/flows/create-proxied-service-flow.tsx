import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Inline } from "@app/components/v4/ui/layout";
import { SmallText } from "@app/components/v4/ui/text";

import { dynamicSecretFlowProviders } from "./dynamic-secret/registry";
import {
  hasAtLeastOneCredential,
  HeaderRewritingMode,
  PROXIED_SERVICE_STEP_FIELDS,
  proxiedServiceFormSchema,
  ProxiedServiceStep,
  type TProxiedServiceForm
} from "./managed-proxy-schema";
import type { ProxiedServiceTemplate } from "./managed-proxy-templates";
import {
  CreateSecretDialog,
  DetailsFields,
  emptySource,
  HeaderFields,
  type ProxyErrors,
  ReviewFields,
  type SourceOption,
  SubstitutionDiagram,
  SubstitutionFields,
  TemplatePicker
} from "./proxied-service-fields";
import { DiscardDialog, LOCAL_ONLY, secretsAt } from "./shared";
import type { AddFlowProps } from "./types";
import { ProviderLogo, WizardSheet } from "./wizard-sheet";

import styles from "./flows.module.css";

const DOCS_URL =
  "https://infisical.com/docs/documentation/platform/agent-proxy/quickstart/credentials";
const STEPS = [
  {
    step: ProxiedServiceStep.Details,
    name: "Details",
    shortDescription: "Name and host",
    title: "Service details",
    subtitle: "Name the service and choose which hosts it brokers.",
    rightDescription:
      "The name identifies this service within the folder. The host pattern decides which outbound requests the agent proxy applies these credentials to."
  },
  {
    step: ProxiedServiceStep.Headers,
    name: "Header rewrites",
    shortDescription: "Request headers",
    title: "Header rewrites",
    subtitle: "Set or overwrite request headers with a secret.",
    rightDescription:
      "The proxy sets these headers on every outbound request, overwriting whatever the agent sent. Use this for Bearer tokens, API-key headers, or basic auth. Skip it if the credential is carried elsewhere."
  },
  {
    step: ProxiedServiceStep.Substitution,
    name: "Substitution",
    shortDescription: "Placeholder swaps",
    title: "Secret substitution",
    subtitle: "Swap a placeholder the agent sends for the real secret.",
    rightDescription:
      "Infisical hands the agent a placeholder as an environment variable; the proxy swaps it for the real secret wherever it appears in the surfaces you pick (path, query, header, body). Ideal when the credential sits in the URL or the agent's client validates its format."
  },
  {
    step: ProxiedServiceStep.Review,
    name: "Review",
    shortDescription: "Confirm",
    title: "Review",
    subtitle: "Confirm the configuration before saving.",
    rightDescription:
      "Double-check the host pattern and each credential. You can edit any of this later from the folder view."
  }
];
const DETAILS = 0;
const HEADERS = 1;
const SUBSTITUTION = 2;
const REVIEW = STEPS.length - 1;

const BROKERABLE_DYNAMIC_SECRETS: Record<string, { name: string; label: string }[]> = {
  kubernetes: [{ name: "TOKEN", label: "Service Account JWT" }],
  github: [{ name: "TOKEN", label: "Token" }],
  "gcp-iam": [{ name: "TOKEN", label: "Token" }],
  "ibm-api-connect": [
    { name: "CLIENT_ID", label: "Client ID" },
    { name: "CLIENT_SECRET", label: "Client Secret" }
  ],
  "elastic-search": [
    { name: "DB_USERNAME", label: "Username" },
    { name: "DB_PASSWORD", label: "Password" }
  ],
  clickhouse: [
    { name: "DB_USERNAME", label: "Database User" },
    { name: "DB_PASSWORD", label: "Database Password" }
  ],
  couchbase: [
    { name: "username", label: "Username" },
    { name: "password", label: "Password" }
  ],
  "rabbit-mq": [
    { name: "DB_USERNAME", label: "Username" },
    { name: "DB_PASSWORD", label: "Password" }
  ],
  snowflake: [
    { name: "DB_USERNAME", label: "Username" },
    { name: "DB_PASSWORD", label: "Password" }
  ],
  milvus: [
    { name: "DB_USERNAME", label: "Database User" },
    { name: "DB_PASSWORD", label: "Database Password" }
  ],
  "azure-entra-id": [
    { name: "email", label: "Email" },
    { name: "password", label: "Password" }
  ],
  totp: [{ name: "TOTP", label: "Time-based one-time password" }]
};

const uniqueServiceName = (base: string, existingNames: string[]) => {
  if (!existingNames.includes(base)) return base;
  let index = 2;
  while (existingNames.includes(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
};
const emptyFormValues = (): TProxiedServiceForm => ({
  name: "",
  hostPattern: "",
  isEnabled: true,
  headerMode: HeaderRewritingMode.Headers,
  headers: [{ ...emptySource(), headerName: "Authorization", headerPrefix: "Bearer" }],
  basicAuth: { username: emptySource(), password: emptySource() },
  substitutions: []
});
const buildTemplateFormValues = (
  template: ProxiedServiceTemplate,
  existingNames: string[]
): TProxiedServiceForm => {
  const isBasicAuth = Boolean(template.seed.basicAuth);
  return {
    name: uniqueServiceName(template.defaultName ?? template.key, existingNames),
    hostPattern: template.hostPattern,
    isEnabled: true,
    headerMode: isBasicAuth ? HeaderRewritingMode.BasicAuth : HeaderRewritingMode.Headers,
    headers: isBasicAuth
      ? []
      : (template.seed.headers ?? []).map((header) => ({
          ...emptySource(),
          headerName: header.headerName,
          headerPrefix: header.headerPrefix ?? ""
        })),
    basicAuth: { username: emptySource(), password: emptySource() },
    substitutions: (template.seed.substitutions ?? []).map((substitution) => ({
      ...emptySource(),
      placeholderKey: substitution.placeholderKey,
      placeholderValue: substitution.generatePlaceholder(),
      surfaces: substitution.surfaces
    }))
  };
};

type Selection = ProxiedServiceTemplate | null | undefined;

export function CreateProxiedServiceFlow({
  open,
  onOpenChange,
  scope,
  resources,
  onCreate,
  onError
}: AddFlowProps) {
  const environment = scope.visibleEnvironments[0].value;
  const at = { project: scope.project, environment, path: scope.path };
  const existingNames = resources
    .filter(
      (resource) =>
        resource.kind === "proxy" &&
        resource.project === scope.project &&
        resource.path === scope.path &&
        scope.visibleEnvironments.some((entry) => entry.value === resource.environment)
    )
    .map((resource) => resource.name);
  const [selection, setSelection] = useState<Selection>(undefined);
  const [form, setForm] = useState<TProxiedServiceForm>(emptyFormValues);
  const [initialForm, setInitialForm] = useState("");
  const [stepIndex, setStepIndex] = useState(DETAILS);
  const [errors, setErrors] = useState<ProxyErrors>({});
  const [credentialError, setCredentialError] = useState(false);
  const [headerSkipConsumed, setHeaderSkipConsumed] = useState(false);
  const [confirm, setConfirm] = useState<"back" | "close">();
  const [secretDraft, setSecretDraft] = useState<{
    key: string;
    apply: (secretKey: string) => void;
  }>();
  const isPicking = selection === undefined;
  const dirty = !isPicking && JSON.stringify(form) !== initialForm;
  const isDuplicateName = existingNames.includes(form.name.trim());
  const isHeaderStepEmpty =
    form.headerMode !== HeaderRewritingMode.BasicAuth && form.headers.length === 0;

  const localSecrets = [
    ...new Set(
      [
        ...secretsAt(resources, scope.project, environment, scope.path),
        ...resources
          .filter(
            (resource) =>
              resource.kind === "import" &&
              !resource.revoked &&
              resource.project === scope.project &&
              resource.environment === environment &&
              resource.path === scope.path
          )
          .flatMap((entry) =>
            entry.kind === "import"
              ? secretsAt(
                  resources,
                  entry.source.project,
                  entry.source.environment,
                  entry.source.path
                )
              : []
          )
      ].map((secret) => secret.name)
    )
  ];
  const sourceOptions: SourceOption[] = [
    ...localSecrets.map((name) => ({ value: `secret:${name}`, label: name, meta: "Secret" })),
    ...resources
      .filter(
        (resource) =>
          resource.kind === "dynamic" &&
          resource.project === scope.project &&
          resource.environment === environment &&
          resource.path === scope.path
      )
      .flatMap((resource): SourceOption[] => {
        const label = resource.kind === "dynamic" ? resource.provider : "";
        const provider = dynamicSecretFlowProviders.find(
          (entry) => entry.label === label
        )?.provider;
        const fields = provider ? BROKERABLE_DYNAMIC_SECRETS[provider] : undefined;
        if (!fields)
          return [
            {
              value: `dynamic:${resource.name}:`,
              label: resource.name,
              meta: "This dynamic secret type can't be brokered over HTTP.",
              disabled: true
            }
          ];
        return fields.map((field) => ({
          value: `dynamic:${resource.name}:${field.name}`,
          label: `${resource.name} → ${field.label}`,
          meta: "Dynamic secret"
        }));
      })
  ];

  const pick = (template: ProxiedServiceTemplate | null) => {
    const seeded = template ? buildTemplateFormValues(template, existingNames) : emptyFormValues();
    setSelection(template);
    setForm(seeded);
    setInitialForm(JSON.stringify(seeded));
    setStepIndex(DETAILS);
    setErrors({});
    setCredentialError(false);
    setHeaderSkipConsumed(false);
  };
  const backToTemplates = () => {
    setConfirm(undefined);
    setSelection(undefined);
  };
  const requestClose = () => {
    if (dirty) setConfirm("close");
    else onOpenChange(false);
  };
  const change = (value: Partial<TProxiedServiceForm>) => {
    setForm((current) => ({ ...current, ...value }));
    setErrors({});
  };

  const isStepValid = (index: number) => {
    const { step } = STEPS[index];
    let fields: string[] = PROXIED_SERVICE_STEP_FIELDS[step];
    if (step === ProxiedServiceStep.Headers)
      fields = form.headerMode === HeaderRewritingMode.BasicAuth ? ["basicAuth"] : ["headers"];
    const parsed = proxiedServiceFormSchema.safeParse(form);
    const issues: ProxyErrors = {};
    if (!parsed.success)
      parsed.error.issues.forEach((issue) => {
        const key = issue.path.join(".");
        if (fields.includes(String(issue.path[0])) && !issues[key]) issues[key] = issue.message;
      });
    setErrors(issues);
    return Object.keys(issues).length === 0;
  };
  const submit = () => {
    const parsed = proxiedServiceFormSchema.safeParse(form);
    if (!parsed.success) {
      onError({
        title: "Failed to create proxied service",
        description: parsed.error.issues.map((issue) => issue.message).join(", ")
      });
      return;
    }
    onCreate(
      [
        {
          ...at,
          kind: "proxy",
          name: parsed.data.name,
          host: parsed.data.hostPattern,
          enabled: parsed.data.isEnabled
        }
      ],
      {
        title: "Successfully created proxied service",
        description: `${LOCAL_ONLY} No agent proxy was configured.`
      }
    );
    onOpenChange(false);
  };
  const next = () => {
    if (stepIndex === REVIEW) {
      if (!hasAtLeastOneCredential(form)) {
        setCredentialError(true);
        setStepIndex(SUBSTITUTION);
        return;
      }
      submit();
      return;
    }
    if (stepIndex === DETAILS && isDuplicateName) return;
    if (!isStepValid(stepIndex)) return;
    if (stepIndex === SUBSTITUTION && !hasAtLeastOneCredential(form)) {
      setCredentialError(true);
      return;
    }
    let target = stepIndex + 1;
    if (target === HEADERS && isHeaderStepEmpty && !headerSkipConsumed) {
      target = SUBSTITUTION;
      setHeaderSkipConsumed(true);
    }
    setStepIndex(target);
  };
  const back = () => {
    if (stepIndex !== DETAILS) {
      setErrors({});
      setStepIndex(stepIndex - 1);
      return;
    }
    if (dirty) setConfirm("back");
    else backToTemplates();
  };
  const createSecret = (query: string, apply: (secretKey: string) => void) =>
    setSecretDraft({ key: query.trim(), apply });

  const current = STEPS[stepIndex];
  const templateName = selection ? selection.name : "Custom";

  return (
    <>
      <WizardSheet
        open={open}
        wide
        onRequestClose={requestClose}
        media={selection ? <ProviderLogo image={selection.image} size={20} /> : undefined}
        title={
          isPicking ? (
            "Choose a template"
          ) : (
            <span className={styles.titleLink}>
              {selection ? selection.name : "Custom proxied service"}
              <Button asChild variant="ghost" size="xs" iconRight="external">
                <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
                  Docs
                </a>
              </Button>
            </span>
          )
        }
        description={
          isPicking
            ? "Pick a service to get a head start, or set one up yourself."
            : "Define how the agent proxy brokers this service."
        }
        steps={
          isPicking
            ? undefined
            : [
                { title: "Template", summary: templateName },
                ...STEPS.map((entry) => ({ title: entry.name, summary: entry.shortDescription }))
              ]
        }
        current={stepIndex + 1}
        onStepClick={(index) => {
          if (index === 0) {
            if (dirty) setConfirm("back");
            else backToTemplates();
            return;
          }
          setErrors({});
          setStepIndex(index - 1);
        }}
        heading={current.title}
        subtitle={current.subtitle}
        aside={
          isPicking ? undefined : (
            <>
              <div className={styles.asideHead}>
                <span className={styles.eyebrow}>{`Step ${stepIndex + 2}`}</span>
                <span className={styles.eyebrow}>{current.name}</span>
              </div>
              <p className={styles.label}>What this step does</p>
              <SmallText muted>{current.rightDescription}</SmallText>
              {current.step === ProxiedServiceStep.Substitution && (
                <SubstitutionDiagram form={form} template={selection ?? undefined} />
              )}
            </>
          )
        }
        footer={
          isPicking ? undefined : (
            <Inline justify="between">
              <SmallText muted>{dirty ? "Unsaved changes" : ""}</SmallText>
              <Inline gap={12}>
                <SmallText muted>{`Step ${stepIndex + 2} of ${STEPS.length + 1}`}</SmallText>
                <Button type="button" variant="outline" onClick={back}>
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={stepIndex === DETAILS && isDuplicateName}
                  onClick={next}
                >
                  {stepIndex === REVIEW ? "Create proxied service" : "Continue"}
                </Button>
              </Inline>
            </Inline>
          )
        }
      >
        {isPicking ? (
          <TemplatePicker onSelect={pick} />
        ) : (
          <form
            noValidate
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              next();
            }}
          >
            {stepIndex === DETAILS && (
              <DetailsFields
                form={form}
                errors={errors}
                isDuplicateName={isDuplicateName}
                onChange={change}
              />
            )}
            {stepIndex === HEADERS && (
              <HeaderFields
                form={form}
                errors={errors}
                sourceOptions={sourceOptions}
                onChange={change}
                onCreateSecret={createSecret}
              />
            )}
            {stepIndex === SUBSTITUTION && (
              <SubstitutionFields
                form={form}
                errors={errors}
                sourceOptions={sourceOptions}
                showCredentialError={credentialError}
                onChange={(value) => {
                  change(value);
                  if (hasAtLeastOneCredential({ ...form, ...value })) setCredentialError(false);
                }}
                onClearCredentialError={() => setCredentialError(false)}
                onCreateSecret={createSecret}
              />
            )}
            {stepIndex === REVIEW && <ReviewFields form={form} />}
          </form>
        )}
      </WizardSheet>
      {secretDraft && (
        <CreateSecretDialog
          open
          suggestedKey={secretDraft.key}
          existing={localSecrets}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setSecretDraft(undefined);
          }}
          onSubmit={(key, value) => {
            onCreate(
              [
                {
                  ...at,
                  kind: "secret",
                  name: key,
                  value: { status: "present", value },
                  comment: "",
                  tags: [],
                  metadata: [],
                  version: 1
                }
              ],
              { title: "Successfully created secret", description: LOCAL_ONLY }
            );
            secretDraft.apply(key);
            setSecretDraft(undefined);
          }}
        />
      )}
      <DiscardDialog
        open={Boolean(confirm)}
        title="Discard setup?"
        description="Your progress configuring this proxied service will be lost."
        onKeep={() => setConfirm(undefined)}
        onDiscard={() => {
          if (confirm === "close") {
            setConfirm(undefined);
            onOpenChange(false);
            return;
          }
          backToTemplates();
        }}
      />
    </>
  );
}
