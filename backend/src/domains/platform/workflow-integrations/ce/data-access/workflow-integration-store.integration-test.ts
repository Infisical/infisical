import { TableName } from "@app/db/schemas";
import { poolStoreConnection, singleStoreConnection } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { TransactionRunner } from "@app/domains/lib/transactions";

import { SlackInstallation } from "../models/slack-installation";
import { TWorkflowIntegrationsStores } from "../services/dependencies";
import {
  microsoftTeamsIntegration,
  slackInstallation,
  slackIntegration
} from "../testing/workflow-integration-fixture";
import { describeWorkflowIntegrationStoreContract } from "../testing/workflow-integration-store-contract";
import { WorkflowIntegrationStore } from "./workflow-integration-store";

const h = setupIntegration();

const newStore = () => new WorkflowIntegrationStore(poolStoreConnection(h.db));

const newRunner = () =>
  new TransactionRunner<TWorkflowIntegrationsStores>(h.db, (trx, locks) => ({
    workflowIntegrationStore: new WorkflowIntegrationStore(singleStoreConnection(trx)),
    locks
  }));

describeWorkflowIntegrationStoreContract("WorkflowIntegrationStore", async () => ({
  store: newStore(),
  newOrgId: async () => (await h.factories.organization()).id
}));

describe("WorkflowIntegrationStore.delete", () => {
  test("should delete the provider row with its parent", async () => {
    // Setup
    const store = newStore();
    const orgId = (await h.factories.organization()).id;
    const slack = slackIntegration({ orgId });
    const teams = microsoftTeamsIntegration({ orgId });
    await store.create(slack);
    await store.create(teams);

    // Action
    await store.delete(slack.id);
    await store.delete(teams.id);

    // Assert
    expect(await h.db(TableName.SlackIntegrations).where({ id: slack.id })).toHaveLength(0);
    expect(await h.db(TableName.MicrosoftTeamsIntegrations).where({ id: teams.id })).toHaveLength(0);
  });
});

describe("WorkflowIntegrationStore.create", () => {
  test("should leave no workflow integration row when the provider insert fails in a transaction", async () => {
    // Setup
    const orgId = (await h.factories.organization()).id;
    const integration = slackIntegration({
      orgId,
      installation: SlackInstallation.restore({ ...slackInstallation().toJSON(), teamId: null as unknown as string })
    });

    // Action
    const result = newRunner().run(({ stores }) => stores.workflowIntegrationStore.create(integration));

    // Assert
    await expect(result).rejects.toThrow();
    expect(await h.db(TableName.WorkflowIntegrations).where({ id: integration.id })).toHaveLength(0);
  });
});

describe("WorkflowIntegrationStore.findByIdForUpdate", () => {
  test("should hold a second transaction until the first commits, then show its write", async () => {
    // Setup
    const orgId = (await h.factories.organization()).id;
    const integration = slackIntegration({ orgId, description: "original" });
    await newStore().create(integration);
    const runner = newRunner();
    const gate = Promise.withResolvers<void>();
    const locked = Promise.withResolvers<void>();
    let secondResolved = false;
    const first = runner.run(async ({ stores }) => {
      const found = await stores.workflowIntegrationStore.findByIdForUpdate(integration.id);
      locked.resolve();
      await gate.promise;
      found?.rename({ description: "written by first" });
      await stores.workflowIntegrationStore.save(found!);
    });
    await locked.promise;

    // Action
    const second = runner.run(async ({ stores }) => {
      const found = await stores.workflowIntegrationStore.findByIdForUpdate(integration.id);
      secondResolved = true;
      return found?.description;
    });
    await vi.waitFor(async () => {
      const { rows } = await h.db.raw<{ rows: { waiting: number }[] }>(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%workflow_integrations%'`
      );
      expect(rows[0].waiting).toBeGreaterThan(0);
    });

    // Assert
    expect(secondResolved).toBe(false);
    gate.resolve();
    await first;
    expect(await second).toBe("written by first");
  });
});
