import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { NotFoundError } from "@app/lib/errors";

import { AlertPermissionAction, TAlertContext } from "../alert-types";
import { TSecretScanningAlertScan } from "./secret-scanning-alert-dal";
import {
  SECRET_SCANNING_RESOURCE_TYPE,
  SecretScanningAlertEvent,
  secretScanningAlertProviderFactory
} from "./secret-scanning-alert-provider";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

const DATA_SOURCE_ID = "7d2a1b6e-1c1f-4b55-9a6a-0f3c5e2d1a01";

const SCANS: TSecretScanningAlertScan[] = [
  {
    scanId: "scan-1",
    scanType: "realtime",
    scanTrigger: "push",
    resourceName: "acme/payments",
    dataSourceId: DATA_SOURCE_ID,
    dataSourceName: "payments-github",
    dataSourceType: "github"
  }
];

const buildProvider = (rules: { action: string; subject: string }[] = []) => {
  const findScansByIds = vi.fn(
    async ({
      dataSourceId,
      scanIds,
      scanTriggers
    }: {
      projectId: string;
      dataSourceId: string;
      scanIds: string[];
      scanTriggers?: string[];
    }) =>
      SCANS.filter(
        (scan) =>
          scan.dataSourceId === dataSourceId &&
          scanIds.includes(scan.scanId) &&
          (!scanTriggers || scanTriggers.includes(scan.scanTrigger as string))
      )
  );
  const findDataSourcesByIds = vi.fn(async (_projectId: string, ids: string[]) =>
    ids.includes(DATA_SOURCE_ID) ? [{ id: DATA_SOURCE_ID, name: "payments-github" }] : []
  );
  const provider = secretScanningAlertProviderFactory({
    secretScanningAlertDAL: {
      findScansByIds,
      findDataSourcesByIds,
      findDataSourceNamesByIds: vi.fn(async () => new Map([[DATA_SOURCE_ID, "payments-github"]]))
    },
    permissionService: {
      getProjectPermission: async () => ({ permission: createMongoAbility(rules as never) })
    } as never
  });
  return { provider, findScansByIds };
};

const eventInput = (eventType: SecretScanningAlertEvent, condition: unknown, payload: Record<string, unknown>) => ({
  orgId: "org-1",
  projectId: "proj-1",
  resourceId: DATA_SOURCE_ID,
  eventType,
  condition,
  targetIds: ["scan-1"],
  payload
});

const alertContext = (eventType: SecretScanningAlertEvent): TAlertContext => ({
  id: "alert-1",
  name: "Secrets detected",
  orgId: "org-1",
  projectId: "proj-1",
  resourceType: SECRET_SCANNING_RESOURCE_TYPE,
  resourceId: DATA_SOURCE_ID,
  eventType,
  condition: null
});

describe("secret scanning alert provider: findEventTargets", () => {
  test("an alert without a condition hears every kind of scan of its data source", async () => {
    const { provider, findScansByIds } = buildProvider();

    const targets = await provider.findEventTargets(
      eventInput(SecretScanningAlertEvent.SecretsDetected, null, { unresolvedFindings: 3 })
    );

    expect(findScansByIds).toHaveBeenCalledWith({
      projectId: "proj-1",
      dataSourceId: DATA_SOURCE_ID,
      scanIds: ["scan-1"],
      scanTriggers: undefined
    });
    expect(targets).toEqual([expect.objectContaining({ scanId: "scan-1", unresolvedFindings: 3 })]);
  });

  test("an alert that leaves out pushes doesn't hear a push scan", async () => {
    const { provider } = buildProvider();

    const withoutPush = await provider.findEventTargets(
      eventInput(
        SecretScanningAlertEvent.SecretsDetected,
        { scanTriggers: ["pull-request"] },
        { unresolvedFindings: 1 }
      )
    );
    const withPush = await provider.findEventTargets(
      eventInput(
        SecretScanningAlertEvent.SecretsDetected,
        { scanTriggers: ["push", "manual"] },
        { unresolvedFindings: 1 }
      )
    );

    expect(withoutPush).toEqual([]);
    expect(withPush).toEqual([expect.objectContaining({ scanId: "scan-1" })]);
  });

  test("a scan-failed event carries its error", async () => {
    const { provider } = buildProvider();

    const targets = await provider.findEventTargets(
      eventInput(SecretScanningAlertEvent.ScanFailed, null, { errorMessage: "boom" })
    );

    expect(targets).toEqual([expect.objectContaining({ scanId: "scan-1", errorMessage: "boom" })]);
  });

  test("an event without a data source matches nothing, since every alert is bound to one", async () => {
    const { provider, findScansByIds } = buildProvider();

    const targets = await provider.findEventTargets({
      ...eventInput(SecretScanningAlertEvent.SecretsDetected, null, { unresolvedFindings: 1 }),
      resourceId: null
    });

    expect(targets).toEqual([]);
    expect(findScansByIds).not.toHaveBeenCalled();
  });

  test("an unreadable payload throws so the outbox records it", async () => {
    const { provider } = buildProvider();

    await expect(
      provider.findEventTargets(eventInput(SecretScanningAlertEvent.SecretsDetected, null, {}))
    ).rejects.toThrow(/Unreadable/);
  });
});

describe("secret scanning alert provider: buildPayload", () => {
  test("summarizes the secrets a scan found and links to them", async () => {
    const { provider } = buildProvider();
    const context = alertContext(SecretScanningAlertEvent.SecretsDetected);
    const targets = await provider.findEventTargets(
      eventInput(SecretScanningAlertEvent.SecretsDetected, null, { unresolvedFindings: 2 })
    );

    const payload = provider.buildPayload(context, targets, await provider.buildViewUrl(context));

    expect(payload.summary).toBe("2 secrets detected in acme/payments. Rotate any that are real");
    expect(payload.severity).toBe("critical");
    expect(payload.items).toEqual([
      expect.objectContaining({
        title: "acme/payments",
        identifier: "payments-github (GitHub)",
        url: "https://app.infisical.com/organizations/org-1/projects/secret-scanning/proj-1/findings?scanId=scan-1",
        fields: [
          { label: "Scan", value: "Push" },
          { label: "Secrets", value: "2" }
        ]
      })
    ]);
  });

  test("a failed scan links to its data source with the error", async () => {
    const { provider } = buildProvider();
    const context = alertContext(SecretScanningAlertEvent.ScanFailed);
    const targets = await provider.findEventTargets(
      eventInput(SecretScanningAlertEvent.ScanFailed, null, { errorMessage: "clone failed" })
    );

    const payload = provider.buildPayload(context, targets, await provider.buildViewUrl(context));

    expect(payload.summary).toBe("Secret scanning failed for acme/payments");
    expect(payload.items[0]).toEqual(
      expect.objectContaining({
        url: `https://app.infisical.com/organizations/org-1/projects/secret-scanning/proj-1/data-sources/github/${DATA_SOURCE_ID}`,
        fields: [
          { label: "Scan", value: "Push" },
          { label: "Error", value: "clone failed" }
        ]
      })
    );
  });
});

describe("secret scanning alert provider: scope and permissions", () => {
  test("refuses a data source from another project", async () => {
    const { provider } = buildProvider();

    await expect(
      provider.assertResourceInScope({
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "7d2a1b6e-1c1f-4b55-9a6a-0f3c5e2d1a99"
      })
    ).rejects.toThrow(NotFoundError);
  });

  test("reading needs data source read, editing also needs data source edit", async () => {
    const actor = { actor: "user", actorId: "user-1", actorAuthMethod: null, actorOrgId: "org-1" } as never;
    const input = { orgId: "org-1", projectId: "proj-1", resourceId: DATA_SOURCE_ID, actor };

    const reader = buildProvider([{ action: "read-data-sources", subject: "secret-scanning-data-sources" }]).provider;
    await expect(reader.assertPermission({ ...input, action: AlertPermissionAction.Read })).resolves.toBeUndefined();
    await expect(reader.assertPermission({ ...input, action: AlertPermissionAction.Edit })).rejects.toThrow(
      ForbiddenError
    );

    const editor = buildProvider([
      { action: "read-data-sources", subject: "secret-scanning-data-sources" },
      { action: "edit-data-sources", subject: "secret-scanning-data-sources" }
    ]).provider;
    await expect(editor.assertPermission({ ...input, action: AlertPermissionAction.Edit })).resolves.toBeUndefined();
  });

  test("names each alert's data source", async () => {
    const { provider } = buildProvider();

    const names = await provider.getResourceNames!({ orgId: "org-1", resourceIds: [DATA_SOURCE_ID] });

    expect(names.get(DATA_SOURCE_ID)).toBe("payments-github");
  });
});
