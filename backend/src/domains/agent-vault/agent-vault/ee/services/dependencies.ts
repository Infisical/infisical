import { GrandfatheredOrg } from "../models/grandfathered-org";

export type TGrandfatheredOrgStore = {
  findByOrgId(rootOrgId: string): Promise<GrandfatheredOrg | null>;
  // Writes only an ending, and only once.
  saveEnded(grandfatheredOrg: GrandfatheredOrg): Promise<void>;
};

export type TGrandfatheredOrgCache = {
  read(rootOrgId: string): Promise<boolean | null>;
  write(rootOrgId: string, isGrandfathered: boolean): Promise<void>;
  forget(rootOrgId: string): Promise<void>;
};
