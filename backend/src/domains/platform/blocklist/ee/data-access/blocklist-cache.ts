import { Blocklist } from "../models/blocklist";
import { TBlocklistCache } from "../services/dependencies";

// In memory, per process: every pod pulls the list itself and checks it on every request.
export class BlocklistCache implements TBlocklistCache {
  private blocklist = Blocklist.empty();

  get(): Blocklist {
    return this.blocklist;
  }

  set(blocklist: Blocklist): void {
    this.blocklist = blocklist;
  }
}
