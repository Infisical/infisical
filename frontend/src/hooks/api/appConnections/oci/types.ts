// Response types
export type TOCIVault = {
  id: string;
  displayName: string;
  compartmentId: string;
  timeCreated: string;
  lifecycleState: string;
};

export type TOCIVaultKey = {
  id: string;
  displayName: string;
};

// Param types
export type TListOCIVaults = {
  connectionId: string;
  compartmentOcid: string;
};

export type TListOCIVaultKeys = {
  connectionId: string;
  compartmentOcid: string;
  vaultOcid: string;
};
