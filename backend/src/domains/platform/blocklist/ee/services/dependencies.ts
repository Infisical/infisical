import { Blocklist } from "../models/blocklist";

export type TBlocklistCache = {
  get(): Blocklist;
  set(blocklist: Blocklist): void;
};
