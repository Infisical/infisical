import { TEntitlementOrg, TEntitlementsResponse } from "../../ce/services/helpers/license-server-types";

export type TLicenseServerEntitlements = {
  // Null when the License Server is not configured or cannot be read.
  getEntitlements(org: TEntitlementOrg): Promise<TEntitlementsResponse | null>;
};
