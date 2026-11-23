import { EntityNotFoundError } from "@app/domains/lib/errors";
import { TTransactionRunner } from "@app/domains/lib/transactions";

import { TInstanceConfigStores } from "../dependencies";

// Setting the instance up creates its first admin and organization in the caller's transaction. claimSetup locks the
// row until that transaction ends, so of two setups at once the second waits, then is refused before it creates
// anything.
export type TInstanceConfigTransaction = {
  // Refuses an instance that is already set up.
  claimSetup(): Promise<void>;
  completeSetup(input: { closeSignUp: boolean; adminIdentityId?: string }): Promise<void>;
};

export const configNotFound = () => new EntityNotFoundError({ name: "AdminConfig", message: "Admin config not found" });

export class InstanceConfigTransaction implements TInstanceConfigTransaction {
  constructor(private readonly transactionRunner: TTransactionRunner<TInstanceConfigStores>) {}

  claimSetup(): Promise<void> {
    return this.transactionRunner.run(async ({ stores }) => {
      const config = await stores.instanceConfigStore.findForUpdate();
      if (!config) throw configNotFound();
      config.assertNotSetUp();
    });
  }

  completeSetup({ closeSignUp, adminIdentityId }: { closeSignUp: boolean; adminIdentityId?: string }): Promise<void> {
    return this.transactionRunner.run(async ({ stores }) => {
      const config = await stores.instanceConfigStore.findForUpdate();
      if (!config) throw configNotFound();
      config.completeSetup({ closeSignUp });
      if (adminIdentityId) config.grantAdminIdentity(adminIdentityId);
      await stores.instanceConfigStore.save(config);
    });
  }
}
