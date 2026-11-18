import { RootKeyConfig } from "../../models/root-key-config";
import { TKmsCoreStores } from "../dependencies";

// False when the row was already gone, so a concurrent removal can't report a deletion that didn't happen.
export const removeRootKeyConfig = async (stores: TKmsCoreStores, row: RootKeyConfig): Promise<boolean> => {
  if (!(await stores.rootKeyConfigStore.delete(row.id))) return false;
  if (row.kekLabel) {
    const entry = await stores.kekHistoryStore.findActiveByLabel(row.kekLabel);
    if (entry) {
      entry.retire(new Date());
      await stores.kekHistoryStore.save(entry);
    }
  }
  return true;
};
