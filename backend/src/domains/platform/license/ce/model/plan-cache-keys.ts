// The key store entries the License domain owns. Names and lifetimes are kept from before the domain
// existed, so a rolling deploy reads the cache old pods wrote.
export const LicenseKeys = {
  cloudPlan: (orgId: string) => `infisical-cloud-plan-${orgId}`,
  // Set alongside the community plan cached when the License Server fails, so callers can tell it from a
  // real answer.
  cloudPlanFallback: (orgId: string) => `infisical-cloud-plan-fallback-${orgId}`,
  cloudPlanLastKnown: (orgId: string) => `infisical-cloud-plan-last-known-${orgId}`,
  // Set after a billing change to serve the cached plan while a background refresh converges.
  passThrough: (orgId: string) => `license-cache-passthrough-${orgId}`,
  revalidateLock: (orgId: string) => `license-cache-revalidate-lock-${orgId}`,
  usageReconcileMarker: (orgId: string) => `license-usage-reconcile-${orgId}`,
  usageLastReported: (orgId: string, featureKey: string) => `license-usage-last-reported-${orgId}-${featureKey}`
};

export const LicenseKeyTtls = {
  cloudPlanInSeconds: 900,
  cloudPlanLastKnownInSeconds: 86400,
  // Covers Stripe reconciling a billing change.
  passThroughInSeconds: 180,
  // A hosted checkout applies only once the customer finishes it, which can take minutes.
  passThroughCheckoutInSeconds: 900,
  revalidateLockInSeconds: 10,
  usageReconcileIntervalInSeconds: 21600,
  usageLastReportedInSeconds: 604800
};
