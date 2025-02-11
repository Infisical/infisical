import { LdapConfigsSchema, OidcConfigsSchema, SamlConfigsSchema } from "@app/db/schemas";

export const SanitizedSamlConfigSchema = SamlConfigsSchema.pick({
  id: true,
  orgId: true,
  isActive: true,
  lastUsed: true,
  createdAt: true,
  updatedAt: true,
  authProvider: true
});

export const SanitizedLdapConfigSchema = LdapConfigsSchema.pick({
  updatedAt: true,
  createdAt: true,
  isActive: true,
  orgId: true,
  id: true,
  url: true,
  searchBase: true,
  searchFilter: true,
  groupSearchBase: true,
  uniqueUserAttribute: true,
  groupSearchFilter: true
});

export const SanitizedOidcConfigSchema = OidcConfigsSchema.pick({
  id: true,
  orgId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  lastUsed: true,
  issuer: true,
  jwksUri: true,
  discoveryURL: true,
  tokenEndpoint: true,
  userinfoEndpoint: true,
  configurationType: true,
  allowedEmailDomains: true,
  authorizationEndpoint: true
});
