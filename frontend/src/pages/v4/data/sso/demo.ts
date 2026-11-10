import type { TEmailDomain } from "@app/hooks/api/emailDomains/types";
import type { TExternalGroupOrgRoleMappingList } from "@app/hooks/api/externalGroupOrgRoleMappings/types";
import type { TGithubOrgSyncConfig } from "@app/hooks/api/githubOrgSyncConfig/types";
import type { TGroupOrgMembership } from "@app/hooks/api/groups/types";
import type { LDAPGroupMap } from "@app/hooks/api/ldapConfig/types";
import { OauthGrantType } from "@app/hooks/api/oauthClients/types";
import type { TOauthClient } from "@app/hooks/api/oauthClients/types";
import { OIDCJWTSignatureAlgorithm } from "@app/hooks/api/oidcConfig/types";
import type { OIDCConfigData } from "@app/hooks/api/oidcConfig/types";
import { ScimEvent } from "@app/hooks/api/scim/types";
import type { ScimEventData, ScimTokenData } from "@app/hooks/api/scim/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { LdapConfig, SamlConfig, SsoAdapter, SsoEntitlements } from "./contract";

const at = "2026-09-02T16:20:00Z";
const ready = <T>(data: T) => ({ data, isPending: false, error: null });
const put = <T>(store: { update: (change: (current: T) => T) => void }, value: T) =>
  store.update(() => value);

const entitlements: SsoEntitlements = {
  samlSSO: true,
  oidcSSO: true,
  ldap: true,
  groups: true,
  scim: true,
  githubOrgSync: true,
  enforceMfa: true,
  enforceGoogleSSO: true,
  emailDomainVerification: true
};

const saml = createFixtureStore<SamlConfig | null>({
  id: "saml-config",
  organization: V4_DEMO_ORG_ID,
  orgId: V4_DEMO_ORG_ID,
  authProvider: "okta-saml",
  isActive: true,
  entryPoint: "https://acme.okta.com/app/infisical/exk1a2b3c4/sso/saml",
  issuer: "http://www.okta.com/exk1a2b3c4",
  cert: "-----BEGIN CERTIFICATE-----\nMIIDqDCCApCgAwIBAgIGAYv...\n-----END CERTIFICATE-----",
  enableGroupSync: false,
  mfaSignalAttribute: null,
  mfaAuthnContexts: null
});

const oidc = createFixtureStore<OIDCConfigData | null>(null);
const ldap = createFixtureStore<LdapConfig | null>(null);
const ldapGroupMaps = createFixtureStore<LDAPGroupMap[]>([]);

const groups: TGroupOrgMembership[] = [
  {
    id: "group-platform",
    name: "Platform",
    slug: "platform",
    orgId: V4_DEMO_ORG_ID,
    createdAt: at,
    updatedAt: at,
    role: "member",
    roleId: ""
  },
  {
    id: "group-security",
    name: "Security",
    slug: "security",
    orgId: V4_DEMO_ORG_ID,
    createdAt: at,
    updatedAt: at,
    role: "admin",
    roleId: ""
  }
] as TGroupOrgMembership[];

const emailDomains = createFixtureStore<TEmailDomain[]>([
  {
    id: "domain-acme-com",
    orgId: V4_DEMO_ORG_ID,
    domain: "acme.com",
    verificationMethod: "dns-txt",
    verificationCode: "infisical-verification=4f1c9e2a7b",
    verificationRecordName: "_infisical-verification.acme.com",
    status: "verified",
    verifiedAt: at,
    codeExpiresAt: "2026-09-09T16:20:00Z",
    createdAt: at,
    updatedAt: at
  },
  {
    id: "domain-acme-io",
    orgId: V4_DEMO_ORG_ID,
    domain: "acme.io",
    verificationMethod: "dns-txt",
    verificationCode: "infisical-verification=93d0b61e5c",
    verificationRecordName: "_infisical-verification.acme.io",
    status: "pending",
    verifiedAt: null,
    codeExpiresAt: "2026-11-17T16:20:00Z",
    createdAt: "2026-11-10T16:20:00Z",
    updatedAt: "2026-11-10T16:20:00Z"
  }
]);

const scimTokens = createFixtureStore<ScimTokenData[]>([
  {
    id: "scim-token-okta",
    ttlDays: 365,
    description: "Okta provisioning",
    tokenSuffix: "x7Qp",
    orgId: V4_DEMO_ORG_ID,
    createdAt: at,
    updatedAt: at
  }
]);

const scimEvents: ScimEventData[] = [
  ScimEvent.CREATE_USER,
  ScimEvent.UPDATE_GROUP,
  ScimEvent.LIST_USERS,
  ScimEvent.DELETE_USER
].map((eventType, index) => ({
  id: `scim-event-${index}`,
  orgId: V4_DEMO_ORG_ID,
  eventType,
  event: { userName: "jordan@acme.com" },
  createdAt: new Date(Date.UTC(2026, 10, 10, 15 - index * 3)).toISOString(),
  updatedAt: at
}));

const groupRoleMappings = createFixtureStore<TExternalGroupOrgRoleMappingList>([
  {
    id: "mapping-eng",
    groupName: "engineering",
    role: "member",
    roleId: "role-member",
    orgId: V4_DEMO_ORG_ID,
    createdAt: at,
    updatedAt: at
  },
  {
    id: "mapping-sec",
    groupName: "security-admins",
    role: "admin",
    roleId: "role-admin",
    orgId: V4_DEMO_ORG_ID,
    createdAt: at,
    updatedAt: at
  }
]);

const githubSync = createFixtureStore<TGithubOrgSyncConfig | undefined>(undefined);

const oauthClient = (
  id: string,
  name: string,
  grantTypes: OauthGrantType[],
  extra: Partial<TOauthClient> = {}
): TOauthClient => ({
  id,
  orgId: V4_DEMO_ORG_ID,
  name,
  description: null,
  clientId: `ic_${id.replace(/-/g, "")}`,
  clientSecretPrefix: "ics_9f2",
  grantTypes,
  redirectUris: [],
  requirePkce: true,
  accessTokenTTL: 3600,
  tokenExchangeAudience: null,
  tokenExchangeIdpSatisfiesMfa: false,
  createdAt: at,
  updatedAt: at,
  ...extra
});

const oauthClients = createFixtureStore<TOauthClient[]>([
  oauthClient(
    "backstage-portal",
    "Backstage portal",
    [OauthGrantType.AuthorizationCode, OauthGrantType.RefreshToken],
    { redirectUris: ["https://backstage.acme.com/api/auth/infisical/handler/frame"] }
  ),
  oauthClient("ci-token-broker", "CI token broker", [OauthGrantType.TokenExchange], {
    tokenExchangeAudience: "https://ci.acme.com",
    requirePkce: false
  })
]);

const secret = () => `ics_${crypto.randomUUID().replace(/-/g, "")}`;

export const ssoDemo: SsoAdapter = {
  useServerConfig: () => ready({ enabledLoginMethods: null }),
  useSubscription: () => ready(entitlements),
  useSamlConfig: () => ready(saml.use()),
  useCreateSamlConfig: fixtureMutation((dto) => {
    put(saml, { id: "saml-config", organization: V4_DEMO_ORG_ID, orgId: V4_DEMO_ORG_ID, ...dto });
    return {};
  }),
  useUpdateSamlConfig: fixtureMutation(({ organizationId, ...dto }) => {
    saml.update((current) =>
      current
        ? {
            ...current,
            ...Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined))
          }
        : current
    );
    return {};
  }),
  useOidcConfig: () => ready(oidc.use()),
  useCreateOidcConfig: fixtureMutation((dto) => {
    put(oidc, {
      id: "oidc-config",
      orgId: V4_DEMO_ORG_ID,
      issuer: dto.issuer ?? "",
      authorizationEndpoint: dto.authorizationEndpoint ?? "",
      configurationType: dto.configurationType,
      discoveryURL: dto.discoveryURL ?? "",
      jwksUri: dto.jwksUri ?? "",
      tokenEndpoint: dto.tokenEndpoint ?? "",
      userinfoEndpoint: dto.userinfoEndpoint ?? "",
      isActive: dto.isActive,
      clientId: dto.clientId,
      clientSecret: dto.clientSecret,
      allowedEmailDomains: dto.allowedEmailDomains,
      manageGroupMemberships: Boolean(dto.manageGroupMemberships),
      jwtSignatureAlgorithm: dto.jwtSignatureAlgorithm ?? OIDCJWTSignatureAlgorithm.RS256,
      mfaClaimName: dto.mfaClaimName ?? "amr",
      mfaAmrValues: dto.mfaAmrValues ?? null
    } as OIDCConfigData);
    return {};
  }),
  useUpdateOidcConfig: fixtureMutation(({ organizationId, ...dto }) => {
    oidc.update((current) =>
      current
        ? ({
            ...current,
            ...Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined))
          } as OIDCConfigData)
        : current
    );
    return {};
  }),
  useLdapConfig: () => ready(ldap.use()),
  useCreateLdapConfig: fixtureMutation(({ organizationId, ...dto }) => {
    put(ldap, {
      id: "ldap-config",
      organization: organizationId,
      caCert: "",
      ...dto
    } as LdapConfig);
    return {};
  }),
  useUpdateLdapConfig: fixtureMutation(({ organizationId, ...dto }) => {
    ldap.update((current) =>
      current
        ? ({
            ...current,
            ...Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined))
          } as LdapConfig)
        : current
    );
    return {};
  }),
  useTestLdapConnection: fixtureMutation(() => true),
  useLdapGroupMaps: () => ready(ldapGroupMaps.use()),
  useCreateLdapGroupMap: fixtureMutation(({ ldapConfigId, ldapGroupCN, groupSlug }) => {
    const group = groups.find((entry) => entry.slug === groupSlug);
    if (!group) throw new Error("Select a group that exists in this organization.");
    ldapGroupMaps.update((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        ldapConfigId,
        ldapGroupCN,
        group: { id: group.id, name: group.name, slug: group.slug }
      }
    ]);
    return {};
  }),
  useDeleteLdapGroupMap: fixtureMutation(({ ldapGroupMapId }) => {
    ldapGroupMaps.update((current) => current.filter((entry) => entry.id !== ldapGroupMapId));
    return {};
  }),
  useOrgGroups: () => ready(groups),
  useEmailDomains: () => ready(emailDomains.use()),
  useCreateEmailDomain: fixtureMutation(({ domain }) => {
    const created: TEmailDomain = {
      id: crypto.randomUUID(),
      orgId: V4_DEMO_ORG_ID,
      domain,
      verificationMethod: "dns-txt",
      verificationCode: `infisical-verification=${crypto.randomUUID().slice(0, 10)}`,
      verificationRecordName: `_infisical-verification.${domain}`,
      status: "pending",
      verifiedAt: null,
      codeExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    emailDomains.update((current) => [...current, created]);
    return created;
  }),
  useVerifyEmailDomain: fixtureMutation(({ emailDomainId }) => {
    let verified: TEmailDomain | undefined;
    emailDomains.update((current) =>
      current.map((entry) => {
        if (entry.id !== emailDomainId) return entry;
        verified = { ...entry, status: "verified", verifiedAt: new Date().toISOString() };
        return verified;
      })
    );
    if (!verified) throw new Error("This domain no longer exists.");
    return verified;
  }),
  useDeleteEmailDomain: fixtureMutation(({ emailDomainId }) => {
    const removed = emailDomains.get().find((entry) => entry.id === emailDomainId);
    if (!removed) throw new Error("This domain no longer exists.");
    emailDomains.update((current) => current.filter((entry) => entry.id !== emailDomainId));
    return removed;
  }),
  useScimTokens: () => ready(scimTokens.use()),
  useCreateScimToken: fixtureMutation(({ description, ttlDays }) => {
    const token = `scim_${crypto.randomUUID().replace(/-/g, "")}`;
    scimTokens.update((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        ttlDays: ttlDays ?? 0,
        description: description ?? "",
        tokenSuffix: token.slice(-4),
        orgId: V4_DEMO_ORG_ID,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    return { scimToken: token };
  }),
  useDeleteScimToken: fixtureMutation(({ scimTokenId }) => {
    scimTokens.update((current) => current.filter((entry) => entry.id !== scimTokenId));
    return { scimToken: "" };
  }),
  useScimEvents: () => ({
    ...ready({ pages: [scimEvents], pageParams: [0] }),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: async () => undefined
  }),
  useExternalGroupRoleMappings: () => ready(groupRoleMappings.use()),
  useUpdateExternalGroupRoleMappings: fixtureMutation(({ mappings }) => {
    put(
      groupRoleMappings,
      mappings.map((mapping) => ({
        id: crypto.randomUUID(),
        groupName: mapping.groupName,
        role: mapping.roleSlug,
        roleId: `role-${mapping.roleSlug}`,
        orgId: V4_DEMO_ORG_ID,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }))
    );
    return {};
  }),
  useGithubOrgSyncConfig: () => ready(githubSync.use()),
  useCreateGithubOrgSyncConfig: fixtureMutation(({ githubOrgName, isActive }) => {
    put(githubSync, {
      id: "github-sync",
      orgId: V4_DEMO_ORG_ID,
      githubOrgName,
      isActive: isActive ?? false,
      createdAt: new Date().toISOString()
    });
    return {};
  }),
  useUpdateGithubOrgSyncConfig: fixtureMutation(({ githubOrgAccessToken, ...dto }) => {
    githubSync.update((current) =>
      current
        ? {
            ...current,
            ...Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined))
          }
        : current
    );
    return {};
  }),
  useDeleteGithubOrgSyncConfig: fixtureMutation(() => {
    put(githubSync, undefined);
    return {};
  }),
  useSyncAllGithubTeams: fixtureMutation(() => ({
    totalUsers: 42,
    errors: [],
    createdTeams: ["platform"],
    updatedTeams: ["security"],
    removedMemberships: 0,
    syncDuration: 1840
  })),
  useOauthClients: () => ready(oauthClients.use()),
  useCreateOauthClient: fixtureMutation((dto) => {
    const id = crypto.randomUUID();
    const client = oauthClient(id, dto.name, dto.grantTypes, {
      description: dto.description ?? null,
      redirectUris: dto.redirectUris,
      requirePkce: dto.requirePkce ?? true,
      accessTokenTTL: dto.accessTokenTTL ?? 3600,
      tokenExchangeAudience: dto.tokenExchangeAudience ?? null,
      tokenExchangeIdpSatisfiesMfa: dto.tokenExchangeIdpSatisfiesMfa ?? false
    });
    oauthClients.update((current) => [...current, client]);
    return { client, clientSecret: secret() };
  }),
  useUpdateOauthClient: fixtureMutation(({ clientDbId, ...dto }) => {
    let updated: TOauthClient | undefined;
    oauthClients.update((current) =>
      current.map((entry) => {
        if (entry.id !== clientDbId) return entry;
        updated = {
          ...entry,
          ...Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)),
          updatedAt: new Date().toISOString()
        };
        return updated;
      })
    );
    if (!updated) throw new Error("This application no longer exists.");
    return updated;
  }),
  useDeleteOauthClient: fixtureMutation(({ clientDbId }) => {
    const removed = oauthClients.get().find((entry) => entry.id === clientDbId);
    if (!removed) throw new Error("This application no longer exists.");
    oauthClients.update((current) => current.filter((entry) => entry.id !== clientDbId));
    return removed;
  }),
  useRotateOauthClientSecret: fixtureMutation(({ clientDbId }) => {
    const client = oauthClients.get().find((entry) => entry.id === clientDbId);
    if (!client) throw new Error("This application no longer exists.");
    return { client, clientSecret: secret() };
  })
};
