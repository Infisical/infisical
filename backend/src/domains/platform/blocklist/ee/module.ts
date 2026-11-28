import type { TLicenseServerBlocklist } from "@app/domains/platform/license/ce/module";
import type { startLocalRefresh, TLocalRefreshHandle } from "@app/lib/cron/local-refresh";
import { logger } from "@app/lib/logger";

import { BlocklistCache } from "./data-access/blocklist-cache";
import { BlocklistService, TBlocklistService } from "./services/blocklist/service";

export { BlockScope } from "./models/blocklist";
export type { TBlockMatch, TBlockSubject } from "./models/blocklist";
export type { TBlocklistService } from "./services/blocklist/service";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export type TBlocklistDeps = {
  licenseBlocklist: TLicenseServerBlocklist;
  isCloud: boolean;
  startLocalRefresh: typeof startLocalRefresh;
};

// Infisical Cloud's blocklist of orgs and users, kept by the License Server. Owns no tables: each pod holds the
// list in memory and refreshes it on a timer. Self-hosted instances never load it.
export class BlocklistEeModule {
  readonly blocklistService: TBlocklistService;

  private constructor(private readonly deps: TBlocklistDeps) {
    this.blocklistService = new BlocklistService(new BlocklistCache(), deps.licenseBlocklist);
  }

  // Loads the list before the pod serves requests. A failure leaves it empty rather than blocking boot or every
  // request while the License Server is down.
  static async create(deps: TBlocklistDeps): Promise<BlocklistEeModule> {
    const module = new BlocklistEeModule(deps);
    if (deps.isCloud) {
      await module.blocklistService.refresh().catch((error: unknown) => {
        logger.error(error, "blocklist: initial load from the License Server failed; starting with an empty list");
      });
    }
    return module;
  }

  startBackgroundSync(): TLocalRefreshHandle | undefined {
    if (!this.deps.isCloud) return undefined;
    return this.deps.startLocalRefresh({
      name: "cloud-blocklist-sync",
      intervalMs: REFRESH_INTERVAL_MS,
      task: () => this.blocklistService.refresh()
    });
  }
}
