import { describe, expect, test } from "vitest";

import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import type { TPrincipal } from "@app/lib/auth/principal";

import { AuditLogActor } from "./audit-log-actor";

describe("AuditLogActor.fromPrincipal", () => {
  const userPrincipal = (overrides: Record<string, unknown> = {}) =>
    ({
      type: ActorType.USER,
      id: "user-1",
      username: "ada",
      email: "ada@example.com",
      authMethod: AuthMethod.EMAIL,
      isSuperAdmin: false,
      ...overrides
    }) as TPrincipal;

  test("should record a user's auth method, email, username and id", () => {
    // Setup
    const principal = userPrincipal();

    // Action
    const actor = AuditLogActor.fromPrincipal(principal);

    // Assert
    expect(actor.toJSON()).toEqual({
      type: ActorType.USER,
      metadata: { authMethod: "email", email: "ada@example.com", username: "ada", userId: "user-1" }
    });
  });

  test("should omit the auth method for a user without one", () => {
    // Setup
    const principal = userPrincipal({ authMethod: null });

    // Action
    const actor = AuditLogActor.fromPrincipal(principal);

    // Assert
    expect(actor.toJSON().metadata).not.toHaveProperty("authMethod");
  });

  test("should record the OAuth client only for an OAuth principal", () => {
    // Setup
    const oauth = userPrincipal({ oauth: { clientId: "client-1" } });
    const plain = userPrincipal();

    // Action
    const withOauth = AuditLogActor.fromPrincipal(oauth).toJSON();
    const withoutOauth = AuditLogActor.fromPrincipal(plain).toJSON();

    // Assert
    expect(withOauth.metadata).toMatchObject({ oauthClientId: "client-1" });
    expect(withoutOauth.metadata).not.toHaveProperty("oauthClientId");
  });

  test("should record the permission attributes when given", () => {
    // Setup
    const principal = userPrincipal();

    // Action
    const actor = AuditLogActor.fromPrincipal(principal, { role: "admin" });

    // Assert
    expect(actor.toJSON().metadata).toMatchObject({ permission: { role: "admin" } });
  });

  test("should record an identity's name, id, auth details and permission", () => {
    // Setup
    const aws = {
      accountId: "1",
      arn: "arn",
      userId: "u",
      partition: "aws",
      service: "ec2",
      resourceType: "role",
      resourceName: "r"
    };
    const principal = {
      type: ActorType.IDENTITY,
      id: "identity-1",
      name: "deployer",
      isInstanceAdmin: false,
      authInfo: {
        authMethod: "aws-auth",
        aws,
        kubernetes: { namespace: "ns", name: "sa" },
        oidc: { claims: { sub: "x" } },
        ignored: "not recorded"
      }
    } as TPrincipal;

    // Action
    const actor = AuditLogActor.fromPrincipal(principal, { project: "p" });

    // Assert
    expect(actor.toJSON()).toEqual({
      type: ActorType.IDENTITY,
      metadata: {
        name: "deployer",
        identityId: "identity-1",
        authMethod: "aws-auth",
        aws,
        kubernetes: { namespace: "ns", name: "sa" },
        oidc: { claims: { sub: "x" } },
        permission: { project: "p" }
      }
    });
  });

  test("should record only the name and id for an identity with no auth info", () => {
    // Setup
    const principal = { type: ActorType.IDENTITY, id: "identity-1", name: "deployer", isInstanceAdmin: false };

    // Action
    const actor = AuditLogActor.fromPrincipal(principal as TPrincipal);

    // Assert
    expect(actor.toJSON()).toEqual({
      type: ActorType.IDENTITY,
      metadata: { name: "deployer", identityId: "identity-1" }
    });
  });

  test("should record a service token's name and id", () => {
    // Setup
    const principal = { type: ActorType.SERVICE, id: "svc-1", name: "ci token", projectId: "p" } as TPrincipal;

    // Action
    const actor = AuditLogActor.fromPrincipal(principal);

    // Assert
    expect(actor.toJSON()).toEqual({ type: ActorType.SERVICE, metadata: { name: "ci token", serviceId: "svc-1" } });
  });

  test.each([
    [ActorType.GATEWAY, { gatewayId: "c-1" }],
    [ActorType.RELAY, { relayId: "c-1" }],
    [ActorType.KMIP_SERVER, { kmipServerId: "c-1" }],
    [ActorType.AGENT_VAULT_PROXY, { agentVaultProxyId: "c-1" }]
  ] as const)("should record the id of a %s", (type, metadata) => {
    // Setup
    const principal = { type, id: "c-1" } as TPrincipal;

    // Action
    const actor = AuditLogActor.fromPrincipal(principal);

    // Assert
    expect(actor.toJSON()).toEqual({ type, metadata });
  });

  test.each([ActorType.SCIM_CLIENT, ActorType.PLATFORM] as const)("should record a %s with no metadata", (type) => {
    // Setup
    const principal = { type, id: "x" } as TPrincipal;

    // Action
    const actor = AuditLogActor.fromPrincipal(principal);

    // Assert
    expect(actor.toJSON()).toEqual({ type, metadata: {} });
  });

  test("should refuse a principal type it has no actor for", () => {
    // Setup
    const principal = { type: "mystery", id: "x" } as unknown as TPrincipal;

    // Action
    const build = () => AuditLogActor.fromPrincipal(principal);

    // Assert
    expect(build).toThrow("no actor for principal type");
  });
});

describe("AuditLogActor.id", () => {
  test.each([
    [{ type: ActorType.USER, metadata: { userId: "u1", username: "ada" } }, "u1"],
    [{ type: ActorType.IDENTITY, metadata: { identityId: "i1", name: "n" } }, "i1"],
    [{ type: ActorType.SERVICE, metadata: { serviceId: "s1", name: "n" } }, "s1"],
    [{ type: ActorType.KMIP_CLIENT, metadata: { clientId: "k1", name: "n" } }, "k1"],
    [{ type: ActorType.GATEWAY, metadata: { gatewayId: "g1" } }, "g1"],
    [{ type: ActorType.RELAY, metadata: { relayId: "r1" } }, "r1"],
    [{ type: ActorType.KMIP_SERVER, metadata: { kmipServerId: "ks1" } }, "ks1"],
    [{ type: ActorType.AGENT_VAULT_PROXY, metadata: { agentVaultProxyId: "a1" } }, "a1"],
    [{ type: ActorType.ACME_ACCOUNT, metadata: { profileId: "p1", accountId: "acct1" } }, "acct1"],
    [{ type: ActorType.EST_ACCOUNT, metadata: { profileId: "p1" } }, "p1"]
  ] as const)("should read the id of a %j actor from its own metadata key", (record, expected) => {
    // Setup
    const actor = AuditLogActor.restore(record as never);

    // Action
    const { id } = actor;

    // Assert
    expect(id).toBe(expected);
  });

  test("should be undefined for an actor without an id", () => {
    // Setup
    const actor = AuditLogActor.restore({ type: ActorType.PLATFORM, metadata: {} });

    // Action
    const { id } = actor;

    // Assert
    expect(id).toBeUndefined();
  });
});
