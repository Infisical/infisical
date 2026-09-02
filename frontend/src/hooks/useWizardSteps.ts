import { useCallback, useState } from "react";

import { createNotification } from "@app/components/notifications";

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
