const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} must be set`);
  }
  return value;
};

// Only true secrets remain in env. Deploy-level identifiers (URLs, org slug,
// SAML config id) live in `./constants.ts` so CI doesn't need to plumb them
// through GH Actions secrets.
export const env = {
  scimToken: required("E2E_SCIM_TOKEN"),
  idpAdminToken: required("E2E_IDP_ADMIN_TOKEN")
};
