import { waitForMinimumDuration } from "@app/lib/fn/promise";

const MIN_AUTH_VERIFICATION_LOADING_MS = 500;

export const waitForMinimumAuthVerificationLoading = (startedAt: number) =>
  waitForMinimumDuration(startedAt, MIN_AUTH_VERIFICATION_LOADING_MS);
