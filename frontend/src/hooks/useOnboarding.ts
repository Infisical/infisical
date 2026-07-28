import { useCallback, useState } from "react";

type TUseOnboardingOptions<TStep extends string> = {
  id: string;
  steps: readonly [TStep, ...TStep[]];
  persistLocally?: boolean;
  completionFlag?: boolean;
  onPersistCompletion?: () => Promise<void>;
  onComplete?: () => Promise<void> | void;
};

const getStorageKey = (id: string) => `infisical:onboarding:${id}:step`;

const getStoredStep = <TStep extends string>(
  storageKey: string,
  steps: readonly [TStep, ...TStep[]]
) => {
  try {
    const storedStep = localStorage.getItem(storageKey);
    return storedStep && steps.includes(storedStep as TStep) ? (storedStep as TStep) : steps[0];
  } catch {
    return steps[0];
  }
};

export const useOnboarding = <TStep extends string>({
  id,
  steps,
  persistLocally = false,
  completionFlag = false,
  onPersistCompletion,
  onComplete
}: TUseOnboardingOptions<TStep>) => {
  const storageKey = getStorageKey(id);
  const [activeStep, setActiveStepState] = useState<TStep>(() =>
    persistLocally ? getStoredStep(storageKey, steps) : steps[0]
  );
  const [isCompleting, setIsCompleting] = useState(false);

  const setActiveStep = useCallback(
    (step: TStep) => {
      setActiveStepState(step);
      if (persistLocally) {
        try {
          localStorage.setItem(storageKey, step);
        } catch {
          // Local progress is best-effort and must not block the onboarding flow.
        }
      }
    },
    [persistLocally, storageKey]
  );

  const activeStepIndex = steps.indexOf(activeStep);

  const next = useCallback(() => {
    const nextStep = steps[activeStepIndex + 1];
    if (nextStep) setActiveStep(nextStep);
  }, [activeStepIndex, setActiveStep, steps]);

  const back = useCallback(() => {
    const previousStep = steps[activeStepIndex - 1];
    if (previousStep) setActiveStep(previousStep);
  }, [activeStepIndex, setActiveStep, steps]);

  const complete = useCallback(async () => {
    setIsCompleting(true);
    try {
      if (completionFlag) {
        await onPersistCompletion?.();
      }
      if (persistLocally) {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // Local progress is best-effort and must not block completion.
        }
      }
      await onComplete?.();
    } finally {
      setIsCompleting(false);
    }
  }, [completionFlag, onComplete, onPersistCompletion, persistLocally, storageKey]);

  return {
    activeStep,
    activeStepIndex,
    back,
    complete,
    isCompleting,
    next,
    setActiveStep
  };
};
