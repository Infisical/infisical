import { ReactNode, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";

export const OnboardingStepTransition = ({
  step,
  children
}: {
  step: string;
  children: ReactNode;
}) => {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const previousStep = useRef(step);

  useEffect(() => {
    if (previousStep.current !== step) {
      containerRef.current?.focus({ preventScroll: true });
      containerRef.current?.scrollIntoView({ block: "nearest" });
      previousStep.current = step;
    }
  }, [step]);

  return (
    <motion.div
      key={step}
      ref={containerRef}
      tabIndex={-1}
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: "easeOut" }}
      className="w-full outline-none"
    >
      {children}
    </motion.div>
  );
};
