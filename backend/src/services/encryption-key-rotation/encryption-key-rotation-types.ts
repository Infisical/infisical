export enum RotationBlocker {
  HsmStrategy = "hsm-strategy",
  RotationPending = "rotation-pending"
}

export type TEncryptionStatus = {
  activeFingerprint: string | null;
  encryptionStrategy: string | null;
  pendingRotation: { id: string; createdAt: Date; fingerprint: string | null } | null;
  retainedKey: {
    id: string;
    supersededAt: Date;
    lastResolvedAt: Date | null;
    fingerprint: string | null;
  } | null;
  history: {
    kekFingerprint: string;
    activatedAt: Date;
    supersededAt?: Date | null;
    retiredAt?: Date | null;
  }[];
  blockers: RotationBlocker[];
};

export type TCreateRotationDTO = {
  replacePending?: boolean;
};

export type TCompleteRotationDTO = {
  rotationId: string;
  acknowledged?: boolean;
};

export type TCreatedRotation = {
  id: string;
  fingerprint: string;
  /** Returned exactly once. Never stored, never logged. */
  key: string;
  /**
   * Set when the previous rotation's key has not been removed yet. Applying this key removes it
   * immediately, so an instance still running it will fail to restart.
   */
  removesRetainedKey?: { fingerprint: string | null; lastResolvedAt: Date | null };
};
