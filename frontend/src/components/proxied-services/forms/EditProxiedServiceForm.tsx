import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DocumentationLinkBadge,
  Stepper,
  StepperList,
  StepperStep
} from "@app/components/v3";
import { useUpdateProxiedService } from "@app/hooks/api/proxiedServices/mutations";
import { TDashboardProxiedService } from "@app/hooks/api/proxiedServices/types";

import { ProxiedServiceDetailsFields } from "./ProxiedServiceDetailsFields";
import { ProxiedServiceHeaderFields } from "./ProxiedServiceHeaderFields";
import { ProxiedServiceReviewFields } from "./ProxiedServiceReviewFields";
import { ProxiedServiceSubstitutionDiagram } from "./ProxiedServiceSubstitutionDiagram";
import { ProxiedServiceSubstitutionFields } from "./ProxiedServiceSubstitutionFields";
import {
  hasAtLeastOneCredential,
  proxiedServiceFormSchema,
  ProxiedServiceStep,
  TProxiedServiceForm
} from "./schema";
import { PROXIED_SERVICE_QUICKSTART_URL, PROXIED_SERVICE_STEPS } from "./stepMeta";
import { toCredentials, toDefaultValues } from "./utils";

const REVIEW = PROXIED_SERVICE_STEPS.length - 1;

type Props = {
  proxiedService: TDashboardProxiedService;
  projectId: string;
  environment: string;
  secretPath: string;
  existingNames: string[];
  onComplete: () => void;
};

export const EditProxiedServiceForm = ({
  proxiedService,
  projectId,
  environment,
  secretPath,
  existingNames,
  onComplete
}: Props) => {
  const updateProxiedService = useUpdateProxiedService();

  const formMethods = useForm<TProxiedServiceForm>({
    resolver: zodResolver(proxiedServiceFormSchema),
    defaultValues: toDefaultValues(proxiedService),
    reValidateMode: "onChange"
  });

  const { handleSubmit, trigger, watch, formState } = formMethods;

  const [stepIndex, setStepIndex] = useState(0);
  const [credentialError, setCredentialError] = useState(false);

  const name = watch("name");
  const isDuplicateName = existingNames.includes(name?.trim());

  const submit = async (form: TProxiedServiceForm) => {
    if (!hasAtLeastOneCredential(form)) {
      setCredentialError(true);
      setStepIndex(
        PROXIED_SERVICE_STEPS.findIndex((s) => s.step === ProxiedServiceStep.Substitution)
      );
      return;
    }
    try {
      await updateProxiedService.mutateAsync({
        serviceId: proxiedService.id,
        name: form.name,
        hostPattern: form.hostPattern,
        isEnabled: form.isEnabled,
        credentials: toCredentials(form)
      });
      createNotification({ text: "Successfully updated proxied service", type: "success" });
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
        text: `Failed to update proxied service${detail ? `: ${detail}` : ""}`,
        type: "error"
      });
    }
  };

  const handleUpdate = async () => {
    if (isDuplicateName) {
      setStepIndex(0);
      return;
    }
    if (!(await trigger())) return;
    handleSubmit(submit)();
  };

  const current = PROXIED_SERVICE_STEPS[stepIndex];

  return (
    <FormProvider {...formMethods}>
      <form className="flex h-full min-h-0 flex-col" onSubmit={(e) => e.preventDefault()}>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
            <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
              Configuration
            </p>
            <Stepper
              activeStep={stepIndex}
              orientation="vertical"
              nonLinear
              onStepChange={setStepIndex}
            >
              <StepperList>
                {PROXIED_SERVICE_STEPS.map((meta, i) => (
                  <StepperStep
                    key={meta.step}
                    index={i}
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

            {stepIndex === 0 && <ProxiedServiceDetailsFields isDuplicateName={isDuplicateName} />}
            {stepIndex === 1 && (
              <ProxiedServiceHeaderFields
                projectId={projectId}
                environment={environment}
                secretPath={secretPath}
              />
            )}
            {stepIndex === 2 && (
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
                {current.rightLabel}
              </p>
              <DocumentationLinkBadge href={PROXIED_SERVICE_QUICKSTART_URL} />
            </div>
            <p className="text-sm font-semibold text-foreground">What this step does</p>
            <p className="text-sm leading-relaxed text-muted">{current.rightDescription}</p>
            {current.step === ProxiedServiceStep.Substitution && (
              <ProxiedServiceSubstitutionDiagram />
            )}
          </aside>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
          <span className="text-xs text-muted">{formState.isDirty ? "Unsaved changes" : ""}</span>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              isDisabled={stepIndex === 0}
              onClick={() => setStepIndex((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
            {stepIndex < REVIEW && (
              <Button
                variant="outline"
                onClick={() => setStepIndex((s) => Math.min(REVIEW, s + 1))}
              >
                Next
              </Button>
            )}
            <Button
              variant="project"
              onClick={handleUpdate}
              isPending={updateProxiedService.isPending}
              isDisabled={updateProxiedService.isPending}
            >
              Update
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
};
