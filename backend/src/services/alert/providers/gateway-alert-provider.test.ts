import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import {
  emitGatewayOffline,
  GATEWAY_OFFLINE_EVENT,
  GATEWAY_RESOURCE_TYPE
} from "@app/ee/services/gateway-v2/gateway-v2-events";

import { formatUtcDate } from "../alert-format-fns";
import { AlertPermissionAction, TAlertContext } from "../alert-types";
import { TGatewayRef } from "./gateway-alert-dal";
import { gatewayAlertProviderFactory } from "./gateway-alert-provider";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

type TOrgGateway = TGatewayRef & { orgId?: string };

const PROD_EU: TOrgGateway = { id: "8a6f0d2e-1c4b-4f7a-9a3e-2b5d7c9e1f01", name: "prod-eu" };
const PROD_US: TOrgGateway = { id: "8a6f0d2e-1c4b-4f7a-9a3e-2b5d7c9e1f02", name: "prod-us" };
const LAST_SEEN = new Date("2026-11-24T09:00:00.000Z");

const buildProvider = (opts: { gateways?: TOrgGateway[]; rules?: { action: string; subject: string }[] } = {}) =>
  gatewayAlertProviderFactory({
    gatewayAlertDAL: {
      findGatewaysByIds: async (ids: string[], orgId: string) =>
        (opts.gateways ?? [PROD_EU, PROD_US])
          .filter((gateway) => ids.includes(gateway.id) && (gateway.orgId ?? "org-1") === orgId)
          .map(({ id, name }) => ({ id, name }))
    },
    permissionService: {
      getOrgPermission: async () => ({
        permission: createMongoAbility(
          (opts.rules ?? [
            { action: "list-gateways", subject: "gateway" },
            { action: "edit-gateways", subject: "gateway" }
          ]) as never
        )
      })
    } as never
  });

const alertContext: TAlertContext = {
  id: "alert-1",
  name: "Gateway offline alert",
  orgId: "org-1",
  projectId: null,
  resourceType: GATEWAY_RESOURCE_TYPE,
  resourceId: null,
  eventType: GATEWAY_OFFLINE_EVENT,
  condition: null
};

const captureEmitted = async (gateways: { id: string; lastSeenAt: Date }[]) => {
  let emitted: Record<string, unknown> | undefined;
  await emitGatewayOffline(
    {
      emit: async ([event]) => {
        emitted = event.data;
      }
    },
    { orgId: "org-1", gateways },
    {} as never
  );
  return emitted!;
};

const offlineEvent = (payload: Record<string, unknown>) => ({
  orgId: "org-1",
  projectId: null,
  resourceId: null,
  eventType: GATEWAY_OFFLINE_EVENT,
  condition: null,
  targetIds: payload.targetIds as string[],
  payload
});

const actor = { actor: "user", actorId: "user-1", actorAuthMethod: null, actorOrgId: "org-1" } as never;

const permissionInput = (action: AlertPermissionAction) => ({
  action,
  orgId: "org-1",
  projectId: null,
  resourceId: null,
  actor
});

describe("gateway alert provider", () => {
  test("delivers what the health check emits, as an org-wide event", async () => {
    const emitted = await captureEmitted([{ id: PROD_EU.id, lastSeenAt: LAST_SEEN }]);
    expect(emitted).toMatchObject({ resourceType: GATEWAY_RESOURCE_TYPE, resourceId: null, projectId: null });

    const targets = await buildProvider().findEventTargets(offlineEvent(emitted));

    expect(targets).toEqual([{ gatewayId: PROD_EU.id, name: "prod-eu", lastSeenAt: LAST_SEEN }]);
  });

  test("drops a gateway that was deleted or sits in another org", async () => {
    const emitted = await captureEmitted([
      { id: PROD_EU.id, lastSeenAt: LAST_SEEN },
      { id: PROD_US.id, lastSeenAt: LAST_SEEN }
    ]);

    const targets = await buildProvider({ gateways: [{ ...PROD_US, orgId: "org-2" }] }).findEventTargets(
      offlineEvent(emitted)
    );

    expect(targets).toEqual([]);
  });

  test("rejects an unreadable payload instead of delivering a blank alert", async () => {
    await expect(
      buildProvider().findEventTargets(offlineEvent({ targetIds: [PROD_EU.id], gateways: [] }))
    ).rejects.toThrow(`Unreadable '${GATEWAY_OFFLINE_EVENT}' payload`);
  });

  test("names the gateway and when it was last seen", () => {
    const payload = buildProvider().buildPayload(
      alertContext,
      [{ gatewayId: PROD_EU.id, name: "prod-eu", lastSeenAt: LAST_SEEN }],
      "https://app.infisical.com/organizations/org-1/networking"
    );

    expect(payload.summary).toBe('Gateway "prod-eu" is offline');
    expect(`${payload.resourceKind} ${payload.eventLabel}`).toBe("Gateway Offline");
    expect(payload.severity).toBe("critical");
    expect(payload.webhookType).toBe("com.infisical.networking.gateway.offline");
    expect(payload.items).toEqual([
      {
        id: PROD_EU.id,
        title: "prod-eu",
        summary: 'Gateway "prod-eu" is offline',
        identifier: PROD_EU.id,
        fields: [{ label: "Last Seen", value: formatUtcDate(LAST_SEEN) }]
      }
    ]);
  });

  test("counts the gateways when several went offline at once", () => {
    const payload = buildProvider().buildPayload(
      alertContext,
      [
        { gatewayId: PROD_EU.id, name: "prod-eu", lastSeenAt: LAST_SEEN },
        { gatewayId: PROD_US.id, name: "prod-us", lastSeenAt: LAST_SEEN }
      ],
      ""
    );

    expect(payload.summary).toBe("2 gateways are offline");
    expect(payload.items.map((item) => item.summary)).toEqual([
      'Gateway "prod-eu" is offline',
      'Gateway "prod-us" is offline'
    ]);
  });

  test("links to the organization's networking page", async () => {
    expect(await buildProvider().buildViewUrl(alertContext)).toBe(
      "https://app.infisical.com/organizations/org-1/networking"
    );
  });

  test("viewing alerts needs list access to gateways", async () => {
    const provider = buildProvider({ rules: [{ action: "list-gateways", subject: "gateway" }] });

    await expect(provider.assertPermission(permissionInput(AlertPermissionAction.Read))).resolves.toBeUndefined();
    await expect(provider.assertPermission(permissionInput(AlertPermissionAction.Create))).rejects.toThrow();
    await expect(provider.assertPermission(permissionInput(AlertPermissionAction.Edit))).rejects.toThrow();
    await expect(provider.assertPermission(permissionInput(AlertPermissionAction.Delete))).rejects.toThrow();
  });

  test("changing alerts needs edit access to gateways", async () => {
    const provider = buildProvider();

    for (const action of [AlertPermissionAction.Create, AlertPermissionAction.Edit, AlertPermissionAction.Delete]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(provider.assertPermission(permissionInput(action))).resolves.toBeUndefined();
    }
  });

  test("refuses an alert bound to one gateway or scoped to a project", async () => {
    const provider = buildProvider();

    await expect(provider.assertResourceInScope({ orgId: "org-1", resourceId: PROD_EU.id })).rejects.toThrow(
      "cannot target one gateway"
    );
    await expect(provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-1" })).rejects.toThrow(
      "cannot be scoped to a project"
    );
    await expect(provider.assertResourceInScope({ orgId: "org-1" })).resolves.toBeUndefined();
  });
});
