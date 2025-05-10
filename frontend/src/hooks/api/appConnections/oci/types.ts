// Response types
export type TOCICompartment = {
  id: string;
  name: string;
};

export type TOCIVault = {
  id: string;
  displayName: string;
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
