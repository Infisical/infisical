export type TRootKeyStatus = {
  encryptionStrategy: string | null;
  active: { label: string | null; activatedAt: Date };
  staged: { label: string | null; createdAt: Date } | null;
  expiring: { label: string | null; supersededAt: Date; lastResolvedAt: Date | null } | null;
};

export type TCreateRotationDTO = {
  replaceStaged?: boolean;
};

export type TListRotationsDTO = {
  offset: number;
  limit: number;
};

export type TRotationHistoryEntry = {
  label: string;
  activatedAt: Date;
  supersededAt: Date | null;
  retiredAt: Date | null;
};

export type TDeleteStagedKeyDTO = {
  label: string;
};

export type TDeleteExpiringKeyDTO = {
  label: string;
  force?: boolean;
};

export type TCreatedRotation = {
  label: string;
  /** Returned exactly once. Never stored, never logged. */
  key: string;
  /**
   * Set when the previous rotation's key has not been removed yet. Applying this key removes it
   * immediately, so an instance still running it will fail to restart.
   */
  removesExpiringKey?: { label: string | null; lastResolvedAt: Date | null };
};
