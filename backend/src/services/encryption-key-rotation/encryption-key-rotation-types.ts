export enum RotationBlocker {
  HsmStrategy = "hsm-strategy",
  RotationPending = "rotation-pending"
}

export type TEncryptionStatus = {
  activeFingerprint: string | null;
  encryptionStrategy: string | null;
  pendingRotation: { id: string; createdAt: Date } | null;
  retainedKey: { id: string; supersededAt: Date; lastResolvedAt: Date | null } | null;
  history: {
    kekFingerprint: string;
    activatedAt: Date;
    supersededAt?: Date | null;
    retiredAt?: Date | null;
  }[];
  blockers: RotationBlocker[];
};

export type TCreateRotationDTO = {
  supersede?: boolean;
};

export type TCreatedRotation = {
  id: string;
  fingerprint: string;
  /** Returned exactly once. Never stored, never logged. */
  key: string;
};
