import { describe, expect, test } from "vitest";

import { RuleViolationError } from "@app/domains/lib/errors";
import { ActorType } from "@app/lib/auth/actor-types";

import { AuditLogEntry } from "./audit-log-entry";
import { AuditLogPolicy } from "./audit-log-policy";
import type { TAuditLogEvent } from "./catalog";
import { EventType, UserAgentType } from "./event-type";

const createdAt = new Date("2026-03-01T12:00:00.000Z");
const event = {
  type: EventType.CREATE_SECRET,
  metadata: { environment: "dev", secretPath: "/", secretId: "s1", secretKey: "K", secretVersion: 1 }
} as TAuditLogEvent;
const actor = { type: ActorType.PLATFORM, metadata: {} } as const;

describe("AuditLogEntry.create", () => {
  test("should return null when the policy drops the event", () => {
    // Setup
    const policy = AuditLogPolicy.create({ retentionDays: 0 });

    // Action
    const entry = AuditLogEntry.create({ id: "log-1", orgId: "org-1", actor, event, createdAt, policy });

    // Assert
    expect(entry).toBeNull();
  });

  test("should stamp the id, ISO timestamps, expiry and project name", () => {
    // Setup
    const policy = AuditLogPolicy.create({ retentionDays: 30 });

    // Action
    const entry = AuditLogEntry.create({
      id: "log-1",
      orgId: "org-1",
      projectId: "project-1",
      projectName: "payments",
      actor,
      event,
      createdAt,
      policy
    });

    // Assert
    expect(entry?.toJSON()).toMatchObject({
      id: "log-1",
      orgId: "org-1",
      projectId: "project-1",
      projectName: "payments",
      createdAt: "2026-03-01T12:00:00.000Z",
      expiresAt: "2026-03-31T12:00:00.000Z"
    });
  });

  test("should refuse an entry without an organization", () => {
    // Setup
    const policy = AuditLogPolicy.create({ retentionDays: 30 });

    // Action
    const create = () => AuditLogEntry.create({ id: "log-1", orgId: undefined, actor, event, createdAt, policy });

    // Assert
    expect(create).toThrow(RuleViolationError);
    expect(create).toThrow(`Audit log for event '${EventType.CREATE_SECRET}' has no organization`);
  });

  test("should serialize to exactly the legacy buffer entry fields", () => {
    // Setup
    const entry = AuditLogEntry.create({
      id: "log-1",
      orgId: "org-1",
      projectId: "project-1",
      projectName: "payments",
      actor,
      event,
      ipAddress: "10.0.0.1",
      userAgent: "curl/8.0",
      userAgentType: UserAgentType.OTHER,
      createdAt,
      policy: AuditLogPolicy.create({ retentionDays: 30 })
    });

    // Action
    const json = entry?.toJSON();

    // Assert
    expect(json).toEqual({
      id: "log-1",
      orgId: "org-1",
      projectId: "project-1",
      projectName: "payments",
      actor: { type: "platform", metadata: {} },
      event: {
        type: "create-secret",
        metadata: { environment: "dev", secretPath: "/", secretId: "s1", secretKey: "K", secretVersion: 1 }
      },
      ipAddress: "10.0.0.1",
      userAgent: "curl/8.0",
      userAgentType: "other",
      createdAt: "2026-03-01T12:00:00.000Z",
      expiresAt: "2026-03-31T12:00:00.000Z"
    });
    expect(Object.keys(json ?? {}).sort()).toEqual(
      [
        "id",
        "orgId",
        "projectId",
        "projectName",
        "actor",
        "event",
        "ipAddress",
        "userAgent",
        "userAgentType",
        "createdAt",
        "expiresAt"
      ].sort()
    );
  });
});
