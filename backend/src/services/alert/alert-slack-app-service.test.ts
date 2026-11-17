import { ForbiddenRequestError } from "@app/lib/errors";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { TAlertProviderRegistry } from "./alert-provider-registry";
import { alertSlackAppServiceFactory } from "./alert-slack-app-service";
import { AlertPermissionAction } from "./alert-types";

const { fetchSlackChannels } = vi.hoisted(() => ({ fetchSlackChannels: vi.fn() }));
vi.mock("@app/services/slack/slack-fns", () => ({ fetchSlackChannels }));

const ORG_ID = "6f1f6f9e-4a4b-4a4b-8a8a-1f1f1f1f1f1f";
const INTEGRATION_ID = "0b9a9d3e-1c1c-4c4c-9d9d-2e2e2e2e2e2e";

const actor = {
  actor: ActorType.USER,
  actorId: "user-1",
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: ORG_ID
};

const build = ({
  allowed = [AlertPermissionAction.Create, AlertPermissionAction.Edit],
  integrationOrgId = ORG_ID
}: { allowed?: AlertPermissionAction[]; integrationOrgId?: string } = {}) => {
  const checked: AlertPermissionAction[] = [];
  const provider = {
    resourceType: "cert-manager",
    assertPermission: vi.fn(async ({ action }: { action: AlertPermissionAction }) => {
      checked.push(action);
      if (!allowed.includes(action)) throw new ForbiddenRequestError({ message: `not allowed to ${action}` });
    }),
    assertResourceInScope: vi.fn(async () => {})
  };
  const findWithWorkflowIntegrationDetails = vi.fn(async () => [
    { id: INTEGRATION_ID, slug: "main", description: null, teamName: "Acme", encryptedBotAccessToken: Buffer.from("x") }
  ]);
  const service = alertSlackAppServiceFactory({
    alertProviderRegistry: { get: () => provider } as unknown as TAlertProviderRegistry,
    slackIntegrationDAL: {
      findWithWorkflowIntegrationDetails,
      findByIdWithWorkflowIntegrationDetails: vi.fn(async () => ({
        id: INTEGRATION_ID,
        orgId: integrationOrgId,
        slug: "main",
        encryptedBotAccessToken: Buffer.from("x")
      }))
    } as never,
    kmsService: {
      createCipherPairWithDataKey: vi.fn(async () => ({ encryptor: vi.fn(), decryptor: () => Buffer.from("xoxb") }))
    } as never
  });
  return { service, checked, findWithWorkflowIntegrationDetails };
};

describe("alert Slack app service", () => {
  beforeEach(() => {
    fetchSlackChannels.mockReset();
  });

  test("lists only the caller's org Slack integrations, without the token", async () => {
    const { service, findWithWorkflowIntegrationDetails } = build();
    const integrations = await service.listSlackIntegrations({ ...actor, resourceType: "cert-manager" });
    expect(findWithWorkflowIntegrationDetails).toHaveBeenCalledWith({ orgId: ORG_ID, integration: "slack" });
    expect(integrations).toEqual([{ id: INTEGRATION_ID, slug: "main", description: null, teamName: "Acme" }]);
  });

  test("lets someone who can only edit alerts list integrations", async () => {
    const { service, checked } = build({ allowed: [AlertPermissionAction.Edit] });
    await service.listSlackIntegrations({ ...actor, resourceType: "cert-manager" });
    expect(checked).toEqual([AlertPermissionAction.Create, AlertPermissionAction.Edit]);
  });

  test("refuses someone who can neither create nor edit alerts", async () => {
    const { service } = build({ allowed: [] });
    await expect(service.listSlackIntegrations({ ...actor, resourceType: "cert-manager" })).rejects.toThrow(
      ForbiddenRequestError
    );
  });

  test("hides another org's integration when listing channels", async () => {
    const { service } = build({ integrationOrgId: "other-org" });
    await expect(
      service.listSlackChannels({ ...actor, resourceType: "cert-manager", workflowIntegrationId: INTEGRATION_ID })
    ).rejects.toThrow("not found");
    expect(fetchSlackChannels).not.toHaveBeenCalled();
  });

  test("turns a Slack failure into a readable error", async () => {
    fetchSlackChannels.mockRejectedValue(new Error("invalid_auth"));
    const { service } = build();
    await expect(
      service.listSlackChannels({ ...actor, resourceType: "cert-manager", workflowIntegrationId: INTEGRATION_ID })
    ).rejects.toThrow("Could not list channels for Slack integration 'main'");
  });
});
