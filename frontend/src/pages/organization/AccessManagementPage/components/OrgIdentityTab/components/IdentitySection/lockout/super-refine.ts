import ms from "ms";
import { z } from "zod";

export function superRefineLockout(
  data: {
    lockoutDurationValue: string;
    lockoutCounterResetValue: string;
    lockoutDurationUnit: "s" | "m" | "h" | "d";
    lockoutCounterResetUnit: "s" | "m" | "h";
    lockoutEnabled: boolean;
  },
  ctx: z.RefinementCtx
) {
  const {
    lockoutDurationValue,
    lockoutCounterResetValue,
    lockoutDurationUnit,
    lockoutCounterResetUnit,
    lockoutEnabled
  } = data;

  if (lockoutEnabled) {
    let isAnyParseError = false;

    const parsedLockoutDuration = parseInt(lockoutDurationValue, 10);
    if (Number.isNaN(parsedLockoutDuration)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Required",
        path: ["lockoutDurationValue"]
      });
      isAnyParseError = true;
    }

    const parsedLockoutCounterReset = parseInt(lockoutCounterResetValue, 10);
    if (Number.isNaN(parsedLockoutCounterReset)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Required",
        path: ["lockoutCounterResetValue"]
      });
      isAnyParseError = true;
    }

    if (!isAnyParseError) {
      const lockoutDurationInSeconds = ms(`${parsedLockoutDuration}${lockoutDurationUnit}`) / 1000;
      const lockoutCounterResetInSeconds =
        ms(`${parsedLockoutCounterReset}${lockoutCounterResetUnit}`) / 1000;

      if (lockoutDurationInSeconds > 86400 || lockoutDurationInSeconds < 30) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Must be between 30 seconds and 1 day",
          path: ["lockoutDurationValue"]
        });
      }

      if (lockoutCounterResetInSeconds > 3600 || lockoutCounterResetInSeconds < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Must be between 5 seconds and 1 hour",
          path: ["lockoutCounterResetValue"]
        });
      }
    }
  }
}
