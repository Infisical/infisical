// Hardcoded deploy-level identifiers. None of these are secrets — pinning
// them here instead of in env vars keeps the CI surface minimal (only the
// SCIM and IdP-admin bearer tokens stay in GH Actions secrets).
//
// If gamma's e2e org or saml_configs row is ever re-bootstrapped from
// scratch, the seed script (backend/scripts/seed-gamma-fixtures.ts) logs the
// new row id on `[seed] E2E_SAML_CONFIG_ID = <uuid>`. Update SAML_CONFIG_ID
// below to match — symptoms otherwise: gamma 404s on the ACS POST and the
// IdP-initiated test fails on the redirect assertion.

export const GAMMA_BASE_URL = "https://gamma.infisical.com";

export const E2E_ORG_SLUG = "e2e-scim-test";

export const IDP_BASE_URL = "https://preview-orchestrator.infisical.workers.dev";

// `saml_configs.id` for the gamma e2e org. Created once by the seed script;
// the row is long-lived, so a constant is acceptable here.
export const SAML_CONFIG_ID = "03b67793-60a4-4d83-84cf-79c9b334d7c3";
