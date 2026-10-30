import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Inline } from "@app/components/v4/ui/layout";
import { Steps } from "@app/components/v4/ui/multi-step";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { SmallText } from "@app/components/v4/ui/text";

import type { Resource } from "../../secrets-model";
import {
  hasAtLeastOneCredential,
  HeaderRewritingMode,
  PROXIED_SERVICE_STEP_FIELDS,
  proxiedServiceFormSchema,
  ProxiedServiceStep,
  type TProxiedServiceForm
} from "../flows/managed-proxy-schema";
import {
  PROXIED_SERVICE_DOCS_URL,
  PROXIED_SERVICE_STEPS,
  proxySources,
  toCredentials,
  toDefaultValues
} from "../flows/managed-proxy-utils";
import {
  CreateSecretDialog,
  DetailsFields,
  HeaderFields,
  type ProxyErrors,
  ReviewFields,
  SubstitutionDiagram,
  SubstitutionFields
} from "../flows/proxied-service-fields";
import { LOCAL_ONLY } from "../flows/shared";
import type { RowActionHostProps } from "./types";

import flowStyles from "../flows/flows.module.css";
import styles from "./proxy-actions.module.css";

type ProxiedService = Extract<Resource, { kind: "proxy" }>;

const REVIEW = PROXIED_SERVICE_STEPS.length - 1;
const SUBSTITUTION = PROXIED_SERVICE_STEPS.findIndex(
  (entry) => entry.step === ProxiedServiceStep.Substitution
);

function EditProxiedServiceSheet({
  service,
  existingNames,
  resources,
  open,
  onOpenChange,
  onSave,
  onCreateSecret
}: {
  service: ProxiedService;
  existingNames: string[];
  resources: readonly Resource[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (form: TProxiedServiceForm) => void;
  onCreateSecret: (key: string, value: string) => void;
}) {
  const [initial] = useState(() => toDefaultValues(service));
  const [form, setForm] = useState(initial);
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<ProxyErrors>({});
  const [credentialError, setCredentialError] = useState(false);
  const [secretDraft, setSecretDraft] = useState<{
    key: string;
    apply: (secretKey: string) => void;
  }>();
  const { localSecrets, sourceOptions } = proxySources(resources, service);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const isDuplicateName = existingNames.includes(form.name.trim());
  const change = (value: Partial<TProxiedServiceForm>) => {
    setForm((current) => ({ ...current, ...value }));
    setErrors({});
  };
  const createSecret = (query: string, apply: (secretKey: string) => void) =>
    setSecretDraft({ key: query.trim(), apply });
  const update = () => {
    if (isDuplicateName) {
      setStepIndex(0);
      return;
    }
    const parsed = proxiedServiceFormSchema.safeParse(form);
    if (!parsed.success) {
      const issues: ProxyErrors = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path.join(".");
        if (!issues[key]) issues[key] = issue.message;
      });
      setErrors(issues);
      return;
    }
    if (!hasAtLeastOneCredential(parsed.data)) {
      setCredentialError(true);
      setStepIndex(SUBSTITUTION);
      return;
    }
    onSave(parsed.data);
  };
  const current = PROXIED_SERVICE_STEPS[stepIndex];
  const stepFields =
    current.step === ProxiedServiceStep.Headers
      ? [form.headerMode === HeaderRewritingMode.BasicAuth ? "basicAuth" : "headers"]
      : PROXIED_SERVICE_STEP_FIELDS[current.step];
  const stepErrors = Object.fromEntries(
    Object.entries(errors).filter(([key]) => stepFields.includes(key.split(".")[0] as never))
  );
  const docs = (
    <Button asChild variant="ghost" size="xs" iconRight="external">
      <a href={PROXIED_SERVICE_DOCS_URL} target="_blank" rel="noopener noreferrer">
        Docs
      </a>
    </Button>
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className={flowStyles.wizardSheet} data-wide="">
          <SheetHeader>
            <div className={flowStyles.titleText}>
              <SheetTitle>
                <span className={flowStyles.titleLink}>
                  {service.name}
                  {docs}
                </span>
              </SheetTitle>
              <SheetDescription>Update how the agent proxy brokers this service.</SheetDescription>
            </div>
          </SheetHeader>
          <SheetBody className={flowStyles.wizardBody}>
            <div className={flowStyles.wizardGrid}>
              <nav className={flowStyles.rail} aria-label="Configuration">
                <p className={flowStyles.eyebrow}>Configuration</p>
                <Steps
                  steps={PROXIED_SERVICE_STEPS.map((entry) => ({
                    title: entry.name,
                    summary: entry.shortDescription
                  }))}
                  current={stepIndex}
                  orientation="vertical"
                  onStepClick={setStepIndex}
                  label="Configuration"
                />
              </nav>
              <div className={flowStyles.wizardMain}>
                <div className={flowStyles.stepHead}>
                  <h3 className={flowStyles.stepHeading}>{current.title}</h3>
                  <p className={flowStyles.stepSubtitle}>{current.subtitle}</p>
                </div>
                <form
                  noValidate
                  className={flowStyles.form}
                  onSubmit={(event) => event.preventDefault()}
                >
                  {current.step === ProxiedServiceStep.Details && (
                    <DetailsFields
                      form={form}
                      errors={stepErrors}
                      isDuplicateName={isDuplicateName}
                      onChange={change}
                    />
                  )}
                  {current.step === ProxiedServiceStep.Headers && (
                    <HeaderFields
                      form={form}
                      errors={stepErrors}
                      sourceOptions={sourceOptions}
                      onChange={change}
                      onCreateSecret={createSecret}
                    />
                  )}
                  {current.step === ProxiedServiceStep.Substitution && (
                    <SubstitutionFields
                      form={form}
                      errors={stepErrors}
                      sourceOptions={sourceOptions}
                      showCredentialError={credentialError}
                      onChange={(value) => {
                        change(value);
                        if (hasAtLeastOneCredential({ ...form, ...value }))
                          setCredentialError(false);
                      }}
                      onClearCredentialError={() => setCredentialError(false)}
                      onCreateSecret={createSecret}
                    />
                  )}
                  {current.step === ProxiedServiceStep.Review && <ReviewFields form={form} />}
                </form>
              </div>
              <aside className={flowStyles.wizardAside}>
                <div className={flowStyles.asideHead}>
                  <span className={flowStyles.eyebrow}>{current.name}</span>
                  <span className={flowStyles.push}>{docs}</span>
                </div>
                <p className={flowStyles.label}>What this step does</p>
                <SmallText muted>{current.rightDescription}</SmallText>
                {current.step === ProxiedServiceStep.Substitution && (
                  <SubstitutionDiagram form={form} />
                )}
              </aside>
            </div>
          </SheetBody>
          <SheetFooter>
            <Inline justify="between">
              <SmallText muted>{dirty ? "Unsaved changes" : ""}</SmallText>
              <Inline gap={12}>
                <Button
                  type="button"
                  variant="outline"
                  disabled={stepIndex === 0}
                  onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
                >
                  Back
                </Button>
                {stepIndex < REVIEW && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStepIndex(Math.min(REVIEW, stepIndex + 1))}
                  >
                    Next
                  </Button>
                )}
                <Button type="button" onClick={update}>
                  Update
                </Button>
              </Inline>
            </Inline>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      {secretDraft && (
        <CreateSecretDialog
          open
          suggestedKey={secretDraft.key}
          existing={localSecrets}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setSecretDraft(undefined);
          }}
          onSubmit={(key, value) => {
            onCreateSecret(key, value);
            secretDraft.apply(key);
            setSecretDraft(undefined);
          }}
        />
      )}
    </>
  );
}

function DeleteProxiedServiceDialog({
  service,
  open,
  onOpenChange,
  onDelete
}: {
  service: ProxiedService;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger" className={styles.wideDialog} confirmText={service.name}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Are you sure you want to delete ${service.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            The agent proxy will stop brokering credentials for this service. This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ProxiedServiceActions({
  action,
  onClose,
  scope,
  resources,
  onApply
}: RowActionHostProps<"proxy">) {
  const [shown, setShown] = useState(action);
  const [session, setSession] = useState(0);
  if (action && action !== shown) {
    setShown(action);
    setSession(session + 1);
  }
  if (!shown) return null;
  const open = Boolean(action);
  const service =
    resources.find(
      (resource): resource is ProxiedService =>
        resource.kind === "proxy" && resource.id === shown.entry.id
    ) ?? shown.entry;
  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  if (shown.action === "delete")
    return (
      <DeleteProxiedServiceDialog
        key={session}
        service={service}
        open={open}
        onOpenChange={onOpenChange}
        onDelete={() => {
          onApply((current) => current.filter((resource) => resource.id !== service.id), {
            title: `Successfully deleted proxied service "${service.name}"`,
            description: `${LOCAL_ONLY} No agent proxy was changed.`
          });
          onClose();
        }}
      />
    );

  const existingNames = [
    ...new Set(
      resources
        .filter(
          (resource) =>
            resource.kind === "proxy" &&
            resource.project === scope.project &&
            resource.path === scope.path &&
            scope.visibleEnvironments.some((entry) => entry.value === resource.environment)
        )
        .map((resource) => resource.name)
    )
  ].filter((name) => name !== service.name);
  return (
    <EditProxiedServiceSheet
      key={session}
      service={service}
      existingNames={existingNames}
      resources={resources}
      open={open}
      onOpenChange={onOpenChange}
      onCreateSecret={(key, value) =>
        onApply(
          (current) => [
            ...current,
            {
              project: service.project,
              environment: service.environment,
              path: service.path,
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
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
        )
      }
      onSave={(form) => {
        onApply(
          (current) =>
            current.map((resource) =>
              resource.id === service.id && resource.kind === "proxy"
                ? {
                    ...resource,
                    name: form.name,
                    host: form.hostPattern,
                    enabled: form.isEnabled,
                    credentials: toCredentials(form),
                    updatedAt: new Date().toISOString()
                  }
                : resource
            ),
          {
            title: "Successfully updated proxied service",
            description: `${LOCAL_ONLY} No agent proxy was changed.`
          }
        );
        onClose();
      }}
    />
  );
}
