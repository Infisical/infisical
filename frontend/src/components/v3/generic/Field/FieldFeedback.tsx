import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "../../utils";

type FieldFeedbackProps = {
  className?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  id?: string;
};

function FieldFeedback({ className, description, error, id }: FieldFeedbackProps) {
  const prefersReducedMotion = useReducedMotion();
  const hasError = error !== null && error !== undefined && error !== false && error !== "";
  const transition = {
    duration: prefersReducedMotion ? 0 : 0.15,
    ease: [0.23, 1, 0.32, 1] as const
  };
  const initial = prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 2 };
  const exit = prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -2 };

  return (
    <motion.div
      id={id}
      layout="size"
      data-slot="field-feedback"
      data-state={hasError ? "error" : "description"}
      className={cn("grid", className)}
      transition={transition}
    >
      <AnimatePresence initial={false}>
        {hasError ? (
          <motion.div
            key="error"
            role="alert"
            data-slot="field-error"
            className="col-start-1 row-start-1 text-left text-2xs leading-snug font-normal text-danger"
            initial={initial}
            animate={{ opacity: 1, y: 0 }}
            exit={exit}
            transition={transition}
          >
            {error}
          </motion.div>
        ) : (
          <motion.p
            key="description"
            data-slot="field-description"
            className="col-start-1 row-start-1 text-left text-2xs leading-snug font-normal text-muted [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-foreground"
            initial={initial}
            animate={{ opacity: 1, y: 0 }}
            exit={exit}
            transition={transition}
          >
            {description}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export { FieldFeedback, type FieldFeedbackProps };
