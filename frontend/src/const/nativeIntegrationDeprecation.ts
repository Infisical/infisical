// Cutoff after which native integrations stop syncing secrets. Every in-product notice reads
// this, so the date is stated in one place. The backend has its own copy in
// backend/src/services/integration/integration-deprecation-fns.ts. Keep the two in sync.
const NATIVE_INTEGRATION_DEPRECATION_DATE = "February 1, 2027";

export { NATIVE_INTEGRATION_DEPRECATION_DATE };
