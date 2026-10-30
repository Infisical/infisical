import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Inline } from "@app/components/v4/ui/layout";
import { SmallText } from "@app/components/v4/ui/text";

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
  PROXIED_SERVICE_DOCS_URL,
  PROXIED_SERVICE_STEPS,
  proxySources,
  toCredentials
} from "./managed-proxy-utils";
import {
  CreateSecretDialog,
  DetailsFields,
  emptySource,
  HeaderFields,
  type ProxyErrors,
  ReviewFields,
  SubstitutionDiagram,
  SubstitutionFields,
  TemplatePicker
} from "./proxied-service-fields";
import { DiscardDialog, LOCAL_ONLY } from "./shared";
import type { AddFlowProps } from "./types";
import { ProviderLogo, WizardSheet } from "./wizard-sheet";

import styles from "./flows.module.css";

const STEPS = PROXIED_SERVICE_STEPS;
const DETAILS = 0;
const HEADERS = 1;
const SUBSTITUTION = 2;
const REVIEW = STEPS.length - 1;

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

  const { localSecrets, sourceOptions } = proxySources(resources, at);

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
          enabled: parsed.data.isEnabled,
          credentials: toCredentials(parsed.data)
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
                <a href={PROXIED_SERVICE_DOCS_URL} target="_blank" rel="noopener noreferrer">
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
