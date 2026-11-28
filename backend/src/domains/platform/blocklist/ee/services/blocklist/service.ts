import { TLicenseServerBlocklist } from "@app/domains/platform/license/ce/module";

import { Blocklist, TBlockMatch, TBlockSubject } from "../../models/blocklist";
import { TBlocklistCache } from "../dependencies";

export type TBlocklistService = {
  findBlock(subject: TBlockSubject): TBlockMatch | null;
  // Throws when the License Server can't be read; the last list stays in place.
  refresh(): Promise<void>;
};

export class BlocklistService implements TBlocklistService {
  constructor(
    private readonly blocklistCache: TBlocklistCache,
    private readonly licenseBlocklist: TLicenseServerBlocklist
  ) {}

  findBlock(subject: TBlockSubject): TBlockMatch | null {
    return this.blocklistCache.get().findBlock(subject, new Date());
  }

  async refresh(): Promise<void> {
    const entries = await this.licenseBlocklist.getBlocklist();
    if (entries === null) return;
    this.blocklistCache.set(Blocklist.restore({ entries }));
  }
}
