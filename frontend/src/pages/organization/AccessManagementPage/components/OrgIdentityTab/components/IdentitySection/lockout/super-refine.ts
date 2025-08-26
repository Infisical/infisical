import { z } from "zod";

import { durationToSeconds } from "@app/helpers/datetime";

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
        message: "Lockout duration must be a number",
        path: ["lockoutDurationValue"]
      });
      isAnyParseError = true;
    }

    const parsedLockoutCounterReset = parseInt(lockoutCounterResetValue, 10);
    if (Number.isNaN(parsedLockoutCounterReset)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Lockout counter reset must be a number",
        path: ["lockoutCounterResetValue"]
      });
      isAnyParseError = true;
    }

    if (!isAnyParseError) {
      const lockoutDurationInSeconds = durationToSeconds(
        parsedLockoutDuration,
        lockoutDurationUnit
      );
      const lockoutCounterResetInSeconds = durationToSeconds(
        parsedLockoutCounterReset,
        lockoutCounterResetUnit
      );

      if (lockoutDurationInSeconds > 86400 || lockoutDurationInSeconds < 30) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Lockout duration must be between 30 seconds and 1 day",
          path: ["lockoutDurationValue"]
        });
      }

      if (lockoutCounterResetInSeconds > 3600 || lockoutCounterResetInSeconds < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Lockout counter reset must be between 5 seconds and 1 hour",
          path: ["lockoutCounterResetValue"]
        });
      }
    }
  }
}
