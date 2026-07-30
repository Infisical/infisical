import { useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";
import { AlertTriangleIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
  DocumentationLinkBadge,
  Stepper,
  StepperList,
  StepperStep
} from "@app/components/v3";
import { ProxiedServiceTemplate } from "@app/helpers/proxiedServiceTemplates";
import { useCreateProxiedService } from "@app/hooks/api/proxiedServices/mutations";

import { ProxiedServiceDetailsFields } from "./ProxiedServiceDetailsFields";
import { ProxiedServiceHeaderFields } from "./ProxiedServiceHeaderFields";
import { ProxiedServiceReviewFields } from "./ProxiedServiceReviewFields";
import { ProxiedServiceSubstitutionDiagram } from "./ProxiedServiceSubstitutionDiagram";
import { ProxiedServiceSubstitutionFields } from "./ProxiedServiceSubstitutionFields";
import {
  hasAtLeastOneCredential,
  HeaderRewritingMode,
  PROXIED_SERVICE_STEP_FIELDS,
  proxiedServiceFormSchema,
  ProxiedServiceStep,
  TProxiedServiceForm
} from "./schema";
import { PROXIED_SERVICE_QUICKSTART_URL, PROXIED_SERVICE_STEPS } from "./stepMeta";
import { buildTemplateFormValues, emptyFormValues, toCredentials } from "./utils";

const DETAILS = 0;
const HEADERS = 1;
const SUBSTITUTION = 2;
const REVIEW = PROXIED_SERVICE_STEPS.length - 1;

type Props = {
  projectId: string;
  environment: string;
  secretPath: string;
  template?: ProxiedServiceTemplate;
  existingNames: string[];
  onComplete: () => void;
  onBackToTemplates: () => void;
};

export const CreateProxiedServiceForm = ({
  projectId,
  environment,
  secretPath,
  template,
  existingNames,
  onComplete,
  onBackToTemplates
}: Props) => {
  const createProxiedService = useCreateProxiedService();

  const defaultValues = useMemo(
    () => (template ? buildTemplateFormValues(template, existingNames) : emptyFormValues()),
    // seed once on mount; regenerating would churn the placeholder values
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const formMethods = useForm<TProxiedServiceForm>({
    resolver: zodResolver(proxiedServiceFormSchema),
    defaultValues,
    reValidateMode: "onChange"
  });

  const { handleSubmit, trigger, watch, getValues, formState } = formMethods;

  const [stepIndex, setStepIndex] = useState(DETAILS);
  const [credentialError, setCredentialError] = useState(false);
  const [confirmBackOpen, setConfirmBackOpen] = useState(false);
  // Templates that don't use header rewrites skip that step once, on first advance. After
  // that the step rejoins normal navigation so Back/Continue never silently skip anything.
  const [headerSkipConsumed, setHeaderSkipConsumed] = useState(false);

  const name = watch("name");
  const headerMode = watch("headerMode");
  const headers = watch("headers");

  const isHeaderStepEmpty =
    headerMode !== HeaderRewritingMode.BasicAuth && (headers?.length ?? 0) === 0;
  const isDuplicateName = existingNames.includes(name?.trim());

  const isStepValid = (index: number) => {
    const { step } = PROXIED_SERVICE_STEPS[index];
    // Only validate the header mode that's actually active, so a half-filled tab you
    // switched away from can't block you.
    if (step === ProxiedServiceStep.Headers) {
      return trigger(headerMode === HeaderRewritingMode.BasicAuth ? ["basicAuth"] : ["headers"]);
    }
    return trigger(PROXIED_SERVICE_STEP_FIELDS[step]);
  };

  const submit = async (form: TProxiedServiceForm) => {
    try {
      await createProxiedService.mutateAsync({
        projectId,
        environment,
        secretPath,
        name: form.name,
        hostPattern: form.hostPattern,
        isEnabled: form.isEnabled,
        credentials: toCredentials(form)
      });
      createNotification({ text: "Successfully created proxied service", type: "success" });
      onComplete();
    } catch (err) {
      const raw = (err as AxiosError<{ message?: string | { message?: string }[] }>)?.response?.data
        ?.message;
      const detail = Array.isArray(raw)
        ? raw
            .map((issue) => issue?.message)
            .filter(Boolean)
            .join(", ")
        : raw;
      createNotification({
        text: `Failed to create proxied service${detail ? `: ${detail}` : ""}`,
        type: "error"
      });
    }
  };

  const handleNext = async () => {
    if (stepIndex === REVIEW) {
      if (!hasAtLeastOneCredential(getValues())) {
        setCredentialError(true);
        setStepIndex(SUBSTITUTION);
        return;
      }
      handleSubmit(submit)();
      return;
    }

    if (stepIndex === DETAILS && isDuplicateName) return;
    if (!(await isStepValid(stepIndex))) return;

    if (stepIndex === SUBSTITUTION && !hasAtLeastOneCredential(getValues())) {
      setCredentialError(true);
      return;
    }

    let next = stepIndex + 1;
    // One-time skip: on the first advance past Details, jump over an unused Header Rewrites
    // step. Once consumed, every step is reachable normally (and Back always lands there).
    if (next === HEADERS && isHeaderStepEmpty && !headerSkipConsumed) {
      next = SUBSTITUTION;
      setHeaderSkipConsumed(true);
    }
    setStepIndex(next);
  };

  const handlePrev = () => {
    if (stepIndex === DETAILS) {
      if (formState.isDirty) setConfirmBackOpen(true);
      else onBackToTemplates();
      return;
    }
    setStepIndex(stepIndex - 1);
  };

  const handleStepperChange = async (stepperIndex: number) => {
    // Stepper index 0 is the Template picker; form steps are 1..N.
    if (stepperIndex === 0) {
      if (formState.isDirty) setConfirmBackOpen(true);
      else onBackToTemplates();
      return;
    }
    const target = stepperIndex - 1;
    if (target === stepIndex) return;
    if (target < stepIndex) {
      setStepIndex(target);
      return;
    }
    for (let i = stepIndex; i < target; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await isStepValid(i))) return;
    }
    setStepIndex(target);
  };

  const current = PROXIED_SERVICE_STEPS[stepIndex];
  const displayedStep = stepIndex + 2; // +1 for Template step, +1 for 1-based display
  const totalSteps = PROXIED_SERVICE_STEPS.length + 1;

  return (
    <FormProvider {...formMethods}>
      <form className="flex h-full min-h-0 flex-col" onSubmit={(e) => e.preventDefault()}>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
            <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
              Setup steps
            </p>
            <Stepper
              activeStep={stepIndex + 1}
              orientation="vertical"
              onStepChange={handleStepperChange}
            >
              <StepperList>
                <StepperStep index={0} title="Template" description={template?.name ?? "Custom"} />
                {PROXIED_SERVICE_STEPS.map((meta, i) => (
                  <StepperStep
                    key={meta.step}
                    index={i + 1}
                    title={meta.name}
                    description={meta.shortDescription}
                    status={
                      credentialError && meta.step === ProxiedServiceStep.Substitution
                        ? "error"
                        : undefined
                    }
                  />
                ))}
              </StepperList>
            </Stepper>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto px-8 py-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground">{current.title}</h2>
              <p className="mt-1 text-sm text-muted">{current.subtitle}</p>
            </div>

            {stepIndex === DETAILS && (
              <ProxiedServiceDetailsFields isDuplicateName={isDuplicateName} />
            )}
            {stepIndex === HEADERS && (
              <ProxiedServiceHeaderFields
                projectId={projectId}
                environment={environment}
                secretPath={secretPath}
              />
            )}
            {stepIndex === SUBSTITUTION && (
              <ProxiedServiceSubstitutionFields
                projectId={projectId}
                environment={environment}
                secretPath={secretPath}
                showCredentialError={credentialError}
                onClearCredentialError={() => setCredentialError(false)}
              />
            )}
            {stepIndex === REVIEW && <ProxiedServiceReviewFields />}
          </div>

          <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                Step {displayedStep} · {current.rightLabel}
              </p>
              <DocumentationLinkBadge href={PROXIED_SERVICE_QUICKSTART_URL} />
            </div>
            <p className="text-sm font-semibold text-foreground">What this step does</p>
            <p className="text-sm leading-relaxed text-muted">{current.rightDescription}</p>
            {current.step === ProxiedServiceStep.Substitution && (
              <ProxiedServiceSubstitutionDiagram template={template} />
            )}
          </aside>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
          <span className="text-xs text-muted">{formState.isDirty ? "Unsaved changes" : ""}</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">
              Step {displayedStep} of {totalSteps}
            </span>
            <Button variant="outline" onClick={handlePrev}>
              Back
            </Button>
            <Button
              variant="project"
              onClick={handleNext}
              isPending={stepIndex === REVIEW && createProxiedService.isPending}
              isDisabled={
                (stepIndex === DETAILS && isDuplicateName) ||
                (stepIndex === REVIEW && createProxiedService.isPending)
              }
            >
              {stepIndex === REVIEW ? "Create Proxied Service" : "Continue"}
            </Button>
          </div>
        </div>
      </form>

      <AlertDialog open={confirmBackOpen} onOpenChange={setConfirmBackOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Discard setup?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress configuring this proxied service will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={onBackToTemplates}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormProvider>
  );
};
