import { ComponentProps, ReactNode, useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@app/components/v3/utils";

import { AuthPageLayout } from "./AuthPageLayout";

type Props = Omit<ComponentProps<typeof AuthPageLayout>, "children" | "headerAction"> & {
  children: ReactNode;
  currentStep: number;
  totalSteps: number;
};

const OnboardingProgress = ({
  currentStep,
  totalSteps
}: Pick<Props, "currentStep" | "totalSteps">) => (
  <div
    role="progressbar"
    aria-label={`Step ${currentStep} of ${totalSteps}`}
    aria-valuemin={1}
    aria-valuemax={totalSteps}
    aria-valuenow={currentStep}
    className="flex items-center gap-1.5"
  >
    {Array.from({ length: totalSteps }, (_, index) => {
      const step = index + 1;

      return (
        <span
          key={step}
          aria-hidden="true"
          className={cn(
            "h-4 w-0.5 bg-foreground/10",
            step < currentStep && "bg-project/40",
            step === currentStep && "bg-project"
          )}
        />
      );
    })}
  </div>
);

type StepTransitionContext = {
  direction: number;
  prefersReducedMotion: boolean;
};

const stepTransitionVariants = {
  enter: ({ direction, prefersReducedMotion }: StepTransitionContext) =>
    prefersReducedMotion
      ? {
          opacity: 0
        }
      : {
          transform: `translate3d(${direction * 32}px, 0, 0) scale(1.01)`,
          opacity: 0.28,
          filter: "blur(4px)"
        },
  center: {
    transform: "translate3d(0, 0, 0) scale(1)",
    opacity: 1,
    filter: "blur(0)"
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0
    }
  }
};

export const OnboardingPageLayout = ({ children, currentStep, totalSteps, ...props }: Props) => {
  const previousStepRef = useRef(currentStep);
  const prefersReducedMotion = useReducedMotion();
  let direction = 0;

  if (currentStep > previousStepRef.current) {
    direction = 1;
  } else if (currentStep < previousStepRef.current) {
    direction = -1;
  }

  useEffect(() => {
    previousStepRef.current = currentStep;
  }, [currentStep]);

  const transitionContext: StepTransitionContext = {
    direction,
    prefersReducedMotion: Boolean(prefersReducedMotion)
  };

  return (
    <AuthPageLayout
      {...props}
      headerAction={<OnboardingProgress currentStep={currentStep} totalSteps={totalSteps} />}
    >
      <div className="relative -m-2 overflow-hidden p-2">
        <AnimatePresence mode="popLayout" initial={false} custom={transitionContext}>
          <motion.div
            key={currentStep}
            custom={transitionContext}
            variants={stepTransitionVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              duration: prefersReducedMotion ? 0.12 : 0.18,
              ease: [0.23, 1, 0.32, 1]
            }}
            className="w-full will-change-transform"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </AuthPageLayout>
  );
};
