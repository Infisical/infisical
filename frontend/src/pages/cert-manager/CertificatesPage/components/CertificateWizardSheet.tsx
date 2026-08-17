import { ReactNode, useCallback, useMemo, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DocumentationLinkBadge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep
} from "@app/components/v3";

export type WizardStep = {
  name: string;
  shortDescription: string;
  title?: string;
  subtitle: string;
  rightLabel?: string;
  rightDescription: string;
};

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  icon: ReactNode;
  title: string;
  description?: string;
  steps: WizardStep[];
  activeStep: number;
  onStepChange: (index: number) => void;
  docsHref?: string;
  children: ReactNode;
  overrideContent?: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  onBack: () => void;
  onContinue: () => void;
  isSubmitting?: boolean;
  isSubmitDisabled?: boolean;
  isContinueDisabled?: boolean;
};

export const useWizardSteps = <TStepKey extends string>({
  stepKeys,
  stepFields,
  invalidMessage,
  validateStep
}: {
  stepKeys: readonly TStepKey[];
  stepFields: Record<TStepKey, string[]>;
  invalidMessage: string;
  /** Gates Continue on the current step's fields, so errors surface where they can be fixed. */
  validateStep?: (fields: string[]) => Promise<boolean>;
}) => {
  const [step, setStep] = useState(0);
  const activeStep = Math.min(step, stepKeys.length - 1);

  const goBack = useCallback(() => setStep(Math.max(0, activeStep - 1)), [activeStep]);
  const goNext = useCallback(async () => {
    if (validateStep && !(await validateStep(stepFields[stepKeys[activeStep]]))) {
      createNotification({ text: "Fix the errors on this step to continue.", type: "error" });
      return;
    }
    setStep(Math.min(stepKeys.length - 1, activeStep + 1));
  }, [stepKeys, stepFields, activeStep, validateStep]);

  const onFormInvalid = useCallback(
    (errors: Record<string, unknown>) => {
      const errorKeys = Object.keys(errors);
      const idx = stepKeys.findIndex((key) =>
        stepFields[key].some((name) => errorKeys.includes(name))
      );
      if (idx >= 0) setStep(idx);
      createNotification({ text: invalidMessage, type: "error" });
    },
    [stepKeys, stepFields, invalidMessage]
  );

  return {
    step: activeStep,
    setStep,
    currentStepKey: stepKeys[activeStep],
    isLastStep: activeStep === stepKeys.length - 1,
    goBack,
    goNext,
    onFormInvalid
  };
};

export const CertificateWizardSheet = ({
  isOpen,
  onOpenChange,
  icon,
  title,
  description,
  steps,
  activeStep,
  onStepChange,
  docsHref,
  children,
  overrideContent,
  submitLabel,
  onSubmit,
  onBack,
  onContinue,
  isSubmitting = false,
  isSubmitDisabled = false,
  isContinueDisabled = false
}: Props) => {
  const step = steps[Math.min(activeStep, steps.length - 1)];
  const isLastStep = activeStep === steps.length - 1;

  const stepperSteps = useMemo(
    () =>
      steps.map((s, i) => (
        <StepperStep key={s.name} index={i} title={s.name} description={s.shortDescription} />
      )),
    [steps]
  );

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 p-0 sm:max-w-[1100px]">
        <SheetHeader className="border-b border-border">
          <div className="flex w-full items-start gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-project/10 text-project">
              {icon}
            </div>
            <div className="min-w-0">
              <SheetTitle>{title}</SheetTitle>
              {description && (
                <SheetDescription className="truncate text-muted">{description}</SheetDescription>
              )}
            </div>
          </div>
        </SheetHeader>

        {overrideContent ?? (
          <form onSubmit={(e) => e.preventDefault()} className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
                <p className="mb-5 text-xs font-medium text-muted">Setup Steps</p>
                <Stepper
                  activeStep={activeStep}
                  orientation="vertical"
                  onStepChange={(i) => {
                    if (isSubmitting) return;
                    if (i < activeStep) onStepChange(i);
                  }}
                >
                  <StepperList>{stepperSteps}</StepperList>
                </Stepper>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto px-8 py-6">
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-foreground">
                    {step.title ?? step.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted">{step.subtitle}</p>
                </div>
                {children}
              </div>

              <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
                <div className="mb-auto">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted">
                      Step {activeStep + 1} · {step.rightLabel ?? step.name}
                    </p>
                    {docsHref && <DocumentationLinkBadge href={docsHref} />}
                  </div>
                  <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{step.rightDescription}</p>
                </div>
              </aside>
            </div>

            <SheetFooter className="shrink-0 items-center justify-end border-t px-6">
              <span className="text-xs text-muted">
                Step {activeStep + 1} of {steps.length}
              </span>
              {activeStep > 0 && (
                <Button type="button" variant="outline" onClick={onBack}>
                  Back
                </Button>
              )}
              {isLastStep ? (
                <Button
                  type="button"
                  variant="project"
                  isPending={isSubmitting}
                  isDisabled={isSubmitting || isSubmitDisabled}
                  onClick={onSubmit}
                >
                  {submitLabel}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="project"
                  isDisabled={isContinueDisabled}
                  onClick={onContinue}
                >
                  Continue
                </Button>
              )}
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
};
