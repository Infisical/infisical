import { useMemo, useState } from "react";

import { ActorType, EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";
import type { Actor, AuditLog, Event } from "@app/hooks/api/auditLogs/types";
import { AuditLogEventClass } from "@app/hooks/api/auditLogSettings/types";
import type { IncidentContact } from "@app/hooks/api/incidentContacts/types";
import { SsoMfaTrust } from "@app/hooks/api/organization/types";
import type { Organization, TOrgProductStats } from "@app/hooks/api/organization/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { certificatesDemoCounts } from "../certificates/demo";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import { kmsDemoKeyCount } from "../kms/demo";
import { demoProjectCount } from "../projects/demo";
import { secretScanningDemoCounts } from "../secret-scanning/demo";
import type { OrgAdapter } from "./contract";

const createdAt = "2024-03-14T09:00:00Z";

const organization = createFixtureStore<Organization>({
  id: V4_DEMO_ORG_ID,
  name: "Acme Corp",
  slug: "acme-corp",
  createAt: createdAt,
  updatedAt: createdAt,
  authEnforced: false,
  googleSsoAuthEnforced: false,
  bypassOrgAuthEnabled: false,
  orgAuthMethod: "",
  scimEnabled: false,
  defaultMembershipRole: "member",
  enforceMfa: false,
  ssoMfaTrust: SsoMfaTrust.None,
  shouldUseNewPrivilegeSystem: true,
  userRole: "admin",
  userJoinedAt: createdAt,
  secretsProductEnabled: true,
  pkiProductEnabled: true,
  kmsProductEnabled: true,
  scannerProductEnabled: true,
  shareSecretsProductEnabled: true,
  maxSharedSecretLifetime: 2592000,
  maxSharedSecretViewLimit: null,
  blockDuplicateSecretSyncDestinations: false,
  allowCrossProjectSecretSharing: false,
  requireGatewayPools: false,
  parentOrgId: null,
  rootOrgId: null,
  pamProjectId: null,
  agentVaultProjectId: null
});

const roles = [
  { id: "role-admin", name: "Admin", slug: "admin" },
  { id: "role-member", name: "Member", slug: "member" },
  { id: "role-no-access", name: "No access", slug: "no-access" }
];

const productStats = (): TOrgProductStats => ({
  secretManager: {
    secretsCount: 52,
    environmentsCount: 9,
    projectsCount: demoProjectCount(ProjectType.SecretManager)
  },
  certificateManager: certificatesDemoCounts(),
  kms: {
    keysCount: kmsDemoKeyCount(),
    clientsCount: 0,
    projectsCount: demoProjectCount(ProjectType.KMS)
  },
  secretScanning: secretScanningDemoCounts(),
  pam: { accountsCount: 0, accountTemplatesCount: 0, foldersCount: 0 },
  agentVault: { accessBundlesCount: 0, servicesCount: 0, proxiesCount: 0 }
});

const contact = (id: string, email: string, at: string): IncidentContact => ({
  id,
  email,
  organization: V4_DEMO_ORG_ID,
  __v: 0,
  createdAt: new Date(at),
  updatedAt: new Date(at)
});

const contacts = createFixtureStore<IncidentContact[]>([
  contact("contact-security", "security@acme.dev", "2025-06-02T10:00:00Z"),
  contact("contact-oncall", "oncall@acme.dev", "2026-01-19T15:30:00Z")
]);

const total = 2316;
const window30d = 30 * 24 * 3600 * 1000;
const now = Date.now();
const people = ["sarah", "marcus", "priya", "diego", "hana", "tom", "lena"].map(
  (name, index): Actor => ({
    type: ActorType.USER,
    metadata: { userId: `user-${index + 1}`, email: `${name}@acme.dev` }
  })
);
const machines = [
  "payments-api-k8s-operator",
  "web-dashboard-github-actions-deploy",
  "platform-core-terraform-runner",
  "billing-worker",
  "internal-pki-cert-issuer"
].map((name, index): Actor => ({
  type: ActorType.IDENTITY,
  metadata: { identityId: `identity-${index + 1}`, name }
}));
const secretProjects = ["payments-api", "web-dashboard", "platform-core"];
const environments = ["production", "staging", "development"];
const secretKeys = ["DATABASE_URL", "STRIPE_API_KEY", "REDIS_URL", "JWT_SIGNING_KEY", "LOG_LEVEL"];

let seed = 20261022;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];
const ipOf = () =>
  `10.${Math.floor(random() * 8)}.${Math.floor(random() * 255)}.${Math.floor(random() * 255)}`;
const secretEvent = (
  type:
    | EventType.GET_SECRET
    | EventType.CREATE_SECRET
    | EventType.UPDATE_SECRET
    | EventType.DELETE_SECRET,
  environment: string
) =>
  ({
    type,
    metadata: {
      environment,
      secretPath: "/",
      secretId: crypto.randomUUID(),
      secretKey: pick(secretKeys),
      secretVersion: 1 + Math.floor(random() * 12)
    }
  }) as Event;

const auditLog = (index: number): AuditLog => {
  const roll = random();
  const at = new Date(
    now - Math.floor((index * window30d) / total) - Math.floor(random() * 120000)
  );
  const project = pick(secretProjects);
  const environment = pick(environments);
  let actor: Actor;
  let event: Event;
  let eventClass = AuditLogEventClass.DataAccess;
  let userAgentType: UserAgentType;
  let projectId: string | undefined = project;
  if (roll < 0.5) {
    actor = pick(machines.slice(0, 4));
    event = {
      type: EventType.GET_SECRETS,
      metadata: { environment, secretPath: "/", numberOfSecrets: 4 + Math.floor(random() * 40) }
    };
    userAgentType =
      index % 3 === 0
        ? UserAgentType.K8_OPERATOR
        : pick([UserAgentType.CLI, UserAgentType.NODE_SDK]);
  } else if (roll < 0.66) {
    actor = pick(machines.slice(0, 4));
    event = {
      type: EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH,
      metadata: {
        identityId: actor.type === ActorType.IDENTITY ? actor.metadata.identityId : "",
        identityUniversalAuthId: crypto.randomUUID(),
        clientSecretId: crypto.randomUUID(),
        identityAccessTokenId: crypto.randomUUID()
      }
    };
    eventClass = AuditLogEventClass.Authentication;
    userAgentType = pick([UserAgentType.CLI, UserAgentType.NODE_SDK, UserAgentType.PYTHON_SDK]);
    projectId = undefined;
  } else if (roll < 0.8) {
    actor = pick(people);
    event = secretEvent(EventType.GET_SECRET, environment);
    userAgentType = pick([UserAgentType.WEB, UserAgentType.CLI]);
  } else if (roll < 0.92) {
    actor = pick(people);
    event = secretEvent(
      pick([
        EventType.UPDATE_SECRET,
        EventType.CREATE_SECRET,
        EventType.UPDATE_SECRET,
        EventType.DELETE_SECRET
      ]),
      environment
    );
    eventClass = AuditLogEventClass.Management;
    userAgentType = pick([UserAgentType.WEB, UserAgentType.CLI, UserAgentType.TERRAFORM]);
  } else if (roll < 0.97) {
    [, , , , actor] = machines;
    event = {
      type: EventType.ISSUE_CERT,
      metadata: {
        caId: "ca-internal-root",
        dn: `CN=${pick(["api.acme.dev", "checkout.acme.dev", "vault.internal.acme.dev"])}`,
        serialNumber: Math.floor(random() * 1e12).toString(16)
      }
    };
    eventClass = AuditLogEventClass.Management;
    userAgentType = UserAgentType.PYTHON_SDK;
    projectId = "internal-pki";
  } else {
    actor = pick(people.slice(0, 2));
    event =
      random() < 0.5
        ? {
            type: EventType.CREATE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET,
            metadata: { identityId: "identity-4", clientSecretId: crypto.randomUUID() }
          }
        : {
            type: EventType.ADD_PROJECT_MEMBER,
            metadata: { userId: "user-5", email: "hana@acme.dev" }
          };
    eventClass = AuditLogEventClass.Management;
    userAgentType = UserAgentType.WEB;
  }
  return {
    id: crypto.randomUUID(),
    actor,
    organization: V4_DEMO_ORG_ID,
    workspace: projectId ?? "",
    ipAddress: ipOf(),
    event: { ...event, class: eventClass },
    userAgent: userAgentType,
    userAgentType,
    createdAt: at.toISOString(),
    updatedAt: at.toISOString(),
    projectId,
    projectName: projectId
  };
};

const auditLogs = createFixtureStore<AuditLog[]>(
  Array.from({ length: total }, (_, index) => auditLog(index))
);

const actorId = (actor: Actor) => {
  if (actor.type === ActorType.USER) return actor.metadata.userId;
  if (actor.type === ActorType.IDENTITY) return actor.metadata.identityId;
  return undefined;
};
const environmentOf = (log: AuditLog) =>
  "environment" in log.event.metadata ? log.event.metadata.environment : undefined;

export const orgDemo: OrgAdapter = {
  useOrganization: () => ({ data: organization.use(), isPending: false, error: null }),
  useProductStats: () => ({ data: productStats(), isPending: false, error: null }),
  useUpdateOrganization: fixtureMutation(({ name, slug, defaultMembershipRoleSlug }) => {
    organization.update((current) => ({
      ...current,
      name: name ?? current.name,
      slug: slug ?? current.slug,
      defaultMembershipRole: defaultMembershipRoleSlug ?? current.defaultMembershipRole
    }));
    return {};
  }),
  useRoles: () => ({ data: roles, isPending: false, error: null }),
  useIncidentContacts: () => ({ data: contacts.use(), isPending: false, error: null }),
  useAddIncidentContact: fixtureMutation(({ email }) => {
    const at = new Date().toISOString();
    contacts.update((current) => [...current, contact(crypto.randomUUID(), email, at)]);
    return {};
  }),
  useDeleteIncidentContact: fixtureMutation(({ incidentContactId }) => {
    contacts.update((current) => current.filter((entry) => entry.id !== incidentContactId));
    return {};
  }),
  useAuditLogs: (filters, projectId) => {
    const logs = auditLogs.use();
    const key = JSON.stringify({ ...filters, projectId });
    const [paging, setPaging] = useState({ key, pages: 1, fetching: false });
    const current = paging.key === key ? paging : { key, pages: 1, fetching: false };
    const matched = useMemo(() => {
      const from = filters.startDate.getTime();
      const to = filters.endDate.getTime();
      return logs.filter((log) => {
        const at = new Date(log.createdAt).getTime();
        return (
          at >= from &&
          at <= to &&
          (!filters.eventType?.length || filters.eventType.includes(log.event.type)) &&
          (!filters.eventClass?.length || filters.eventClass.includes(log.event.class)) &&
          (!filters.actorType || log.actor.type === filters.actorType) &&
          (!filters.actor || actorId(log.actor) === filters.actor) &&
          (!filters.userAgentType || log.userAgentType === filters.userAgentType) &&
          (!projectId || log.projectId === projectId) &&
          (!filters.environment || environmentOf(log) === filters.environment)
        );
      });
    }, [logs, key]);
    const pages = Array.from({ length: current.pages }, (_, index) =>
      matched.slice(index * filters.limit, (index + 1) * filters.limit)
    );
    return {
      data: { pages, pageParams: pages.map((_, index) => index * filters.limit) },
      isPending: false,
      error: null,
      hasNextPage: pages[pages.length - 1].length !== 0,
      isFetchingNextPage: current.fetching,
      fetchNextPage: () => {
        setPaging({ ...current, fetching: true });
        return new Promise<void>((resolve) => {
          window.setTimeout(() => {
            setPaging({ key, pages: current.pages + 1, fetching: false });
            resolve();
          }, 600);
        });
      }
    };
  }
};
