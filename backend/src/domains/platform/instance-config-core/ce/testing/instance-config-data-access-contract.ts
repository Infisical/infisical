import { INSTANCE_CONFIG_ID, InstanceConfig } from "../model/instance-config";
import { InstanceConfigChange } from "../model/instance-config-change";
import { TInstanceConfigCoreDataAccessDeps } from "../module";

export type TInstanceConfigContractHarness = {
  // A fresh, empty super_admin table.
  build: () => Promise<TInstanceConfigCoreDataAccessDeps>;
  // An org with an active SAML config, to name as the default auth org.
  addSamlOrg: () => Promise<{ id: string; slug: string }>;
};

const createRow = (deps: TInstanceConfigCoreDataAccessDeps, fipsEnabled = false) =>
  deps.transactionRunner.run(({ dataAccess }) =>
    dataAccess.instanceConfig.createIfMissing(InstanceConfig.initial({ fipsEnabled }))
  );

// What every InstanceConfigDataAccess, in memory or on Postgres, must do.
export const describeInstanceConfigDataAccessContract = (
  name: string,
  harness: () => TInstanceConfigContractHarness
) => {
  describe(`InstanceConfigDataAccess contract (${name})`, () => {
    test("should create the row once and keep the first row on a second create", async () => {
      // Setup
      const deps = await harness().build();
      await createRow(deps, true);

      // Action
      const second = await createRow(deps, false);

      // Assert
      expect(second.toView().id).toBe(INSTANCE_CONFIG_ID);
      expect(second.toView().fipsEnabled).toBe(true);
    });

    test("should return the default auth org's slug, enforcement and SSO method with the row", async () => {
      // Setup
      const h = harness();
      const deps = await h.build();
      await createRow(deps);
      const org = await h.addSamlOrg();
      await deps.transactionRunner.run(({ dataAccess }) =>
        dataAccess.instanceConfig.update(InstanceConfigChange.create({ defaultAuthOrgId: org.id }))
      );

      // Action
      const config = await deps.dataAccess.instanceConfig.findById();

      // Assert
      const view = config?.toView();
      expect(view?.defaultAuthOrgSlug).toBe(org.slug);
      expect(view?.defaultAuthOrgAuthMethod).toBe("saml");
    });

    test("should return the updated row with a later updatedAt after an update", async () => {
      // Setup
      const deps = await harness().build();
      const created = await createRow(deps);

      // Action
      await deps.transactionRunner.run(({ dataAccess }) =>
        dataAccess.instanceConfig.update(InstanceConfigChange.create({ allowSignUp: false }))
      );

      // Assert
      const updated = await deps.dataAccess.instanceConfig.findById();
      expect(updated?.toView().allowSignUp).toBe(false);
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
    });
  });
};
