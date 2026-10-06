import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import {
  emitSecretReminderDue,
  SECRET_REMINDER_DUE_EVENT,
  SECRET_REMINDER_RESOURCE_TYPE
} from "@app/services/reminder/reminder-events";

import { AlertPermissionAction, TAlertContext } from "../alert-types";
import { TSecretWithLocation } from "./secret-reminder-alert-dal";
import { secretReminderAlertProviderFactory } from "./secret-reminder-alert-provider";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

const SECRET: TSecretWithLocation = {
  secretId: "secret-1",
  secretKey: "DB_PASSWORD",
  secretType: "shared",
  folderId: "folder-1",
  orgId: "org-1",
  projectId: "proj-1",
  envSlug: "prod",
  envName: "Production",
  tagSlugs: ["payments"]
};

const buildProvider = (
  opts: {
    secrets?: TSecretWithLocation[];
    rules?: { action: string; subject: string }[];
    unresolvedPath?: boolean;
  } = {}
) => {
  const permissionCalls: unknown[] = [];
  const pathLookupOptions: unknown[] = [];
  const provider = secretReminderAlertProviderFactory({
    secretReminderAlertDAL: {
      findSecretsByIds: async (ids: string[]) =>
        (opts.secrets ?? [SECRET]).filter((secret) => ids.includes(secret.secretId))
    },
    folderDAL: {
      findSecretPathByFolderIds: async (_projectId: string, _folderIds: string[], _tx: unknown, options: unknown) => {
        pathLookupOptions.push(options);
        return opts.unresolvedPath ? [] : [{ id: "folder-1", path: "/payments" }];
      }
    } as never,
    permissionService: {
      getProjectPermission: async (input: unknown) => {
        permissionCalls.push(input);
        return {
          permission: createMongoAbility(
            (opts.rules ?? [
              { action: "edit", subject: "secrets" },
              { action: "describeSecret", subject: "secrets" }
            ]) as never
          )
        };
      }
    } as never
  });
  return { provider, permissionCalls, pathLookupOptions };
};

const alertContext: TAlertContext = {
  id: "alert-1",
  name: "Reminder for DB_PASSWORD",
  orgId: "org-1",
  projectId: "proj-1",
  resourceType: SECRET_REMINDER_RESOURCE_TYPE,
  resourceId: "secret-1",
  eventType: SECRET_REMINDER_DUE_EVENT,
  condition: null
};

const dueEvent = (payload: Record<string, unknown> = {}) => ({
  orgId: "org-1",
  projectId: "proj-1",
  resourceId: "secret-1",
  eventType: SECRET_REMINDER_DUE_EVENT,
  condition: null,
  targetIds: ["secret-1"],
  payload: { note: "rotate it", repeatDays: 30, occurrenceDate: "2026-10-10", ...payload }
});

const actor = { actor: "user", actorId: "user-1", actorAuthMethod: null, actorOrgId: "org-1" } as never;

describe("secret reminder alert provider", () => {
  test("delivers what the reminder cron emits", async () => {
    let emitted: Record<string, unknown> | undefined;
    await emitSecretReminderDue(
      {
        emit: async (event) => {
          emitted = event.payload;
        }
      },
      {
        orgId: "org-1",
        projectId: "proj-1",
        reminderId: "rem-1",
        secretId: "secret-1",
        note: "rotate it",
        repeatDays: 30,
        occurrenceDate: "2026-10-10"
      },
      {} as never
    );

    const { provider } = buildProvider();
    const targets = await provider.findEventTargets({
      ...dueEvent(),
      targetIds: emitted!.targetIds as string[],
      payload: emitted!
    });

    expect(targets).toHaveLength(1);
    expect(provider.targetId(targets[0])).toBe("secret-1:2026-10-10");
  });

  test("drops a secret that is gone or sits in a soft-deleted environment", async () => {
    const { provider } = buildProvider({ secrets: [] });
    expect(await provider.findEventTargets(dueEvent())).toEqual([]);
  });

  // An empty result here marks the event delivered, so a replica that has not seen a new folder would lose
  // the reminder for good.
  test("reads folder paths from the primary", async () => {
    const { provider, pathLookupOptions } = buildProvider();
    await provider.findEventTargets(dueEvent());
    expect(pathLookupOptions).toEqual([{ readFromPrimary: true }]);
  });

  test("drops a secret whose folder path cannot be resolved", async () => {
    const { provider } = buildProvider({ unresolvedPath: true });
    expect(await provider.findEventTargets(dueEvent())).toEqual([]);
  });

  test("drops a secret that does not belong to the event's project", async () => {
    const { provider } = buildProvider({ secrets: [{ ...SECRET, projectId: "proj-2" }] });
    expect(await provider.findEventTargets(dueEvent())).toEqual([]);
  });

  test("rejects an unreadable payload instead of delivering a blank reminder", async () => {
    const { provider } = buildProvider();
    await expect(provider.findEventTargets(dueEvent({ occurrenceDate: "10/10/2026" }))).rejects.toThrow(
      "Unreadable 'secret.reminder.due' payload"
    );
  });

  test("the payload names the secret's current key, environment, path, schedule and note", async () => {
    const { provider } = buildProvider({ secrets: [{ ...SECRET, secretKey: "DB_PASSWORD_V2" }] });
    const targets = await provider.findEventTargets(dueEvent());
    const payload = provider.buildPayload(alertContext, targets, "https://view");

    expect(payload.summary).toBe("Reminder for secret 'DB_PASSWORD_V2' in Production");
    expect(payload.items[0].fields).toEqual([
      { label: "Environment", value: "Production" },
      { label: "Path", value: "/payments" },
      { label: "Schedule", value: "Every 30 days" },
      { label: "Due", value: "October 10, 2026" },
      { label: "Note", value: "rotate it" }
    ]);
  });

  test("a one-time reminder without a note says so and omits the note", async () => {
    const { provider } = buildProvider();
    const targets = await provider.findEventTargets(dueEvent({ repeatDays: null, note: null }));
    const payload = provider.buildPayload(alertContext, targets, "https://view");

    expect(payload.items[0].fields).toContainEqual({ label: "Schedule", value: "One time" });
    expect(payload.items[0].fields?.some((field) => field.label === "Note")).toBe(false);
  });

  test("links to the secret on the overview page", async () => {
    const { provider } = buildProvider();
    const url = new URL(await provider.buildViewUrl(alertContext));

    expect(url.pathname).toBe("/organizations/org-1/projects/secret-management/proj-1/overview");
    expect(url.searchParams.get("secretPath")).toBe("/payments");
    expect(url.searchParams.get("environments")).toBe('["prod"]');
    expect(url.searchParams.get("search")).toBe("DB_PASSWORD");
  });

  test("refuses to authorize anything not bound to a single secret", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Read,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: null,
        actor
      })
    ).rejects.toThrow("Secret reminders can only be managed for a single secret");
  });

  test("reading a reminder needs describe access to its secret", async () => {
    const { provider } = buildProvider({ rules: [] });
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Read,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "secret-1",
        actor
      })
    ).rejects.toThrow();
  });

  test("changing a reminder needs edit access to its secret", async () => {
    const { provider } = buildProvider({ rules: [{ action: "describeSecret", subject: "secrets" }] });
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Edit,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "secret-1",
        actor
      })
    ).rejects.toThrow();
  });

  test("allows edit when the caller can edit the secret", async () => {
    const { provider, permissionCalls } = buildProvider();
    await provider.assertPermission({
      action: AlertPermissionAction.Edit,
      orgId: "org-1",
      projectId: "proj-1",
      resourceId: "secret-1",
      actor
    });
    expect(permissionCalls).toHaveLength(1);
  });

  test("rejects a secret from another project or org as not found", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-2", resourceId: "secret-1" })
    ).rejects.toThrow("Secret with ID 'secret-1' not found in this project");
    await expect(
      provider.assertResourceInScope({ orgId: "org-2", projectId: "proj-1", resourceId: "secret-1" })
    ).rejects.toThrow("not found in this project");
  });

  test("refuses to authorize a secret whose folder path cannot be resolved, rather than checking the root", async () => {
    const { provider, permissionCalls } = buildProvider({ unresolvedPath: true });
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Edit,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "secret-1",
        actor
      })
    ).rejects.toThrow("Secret with ID 'secret-1' not found in this project");
    expect(permissionCalls).toHaveLength(0);
  });

  test("rejects an org-scoped reminder alert", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: null, resourceId: "secret-1" })
    ).rejects.toThrow("Secret reminders must be managed within a project");
  });

  test("rejects a personal secret", async () => {
    const { provider } = buildProvider({ secrets: [{ ...SECRET, secretType: "personal" }] });
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-1", resourceId: "secret-1" })
    ).rejects.toThrow("Reminders can only be set on shared secrets");
  });
});
