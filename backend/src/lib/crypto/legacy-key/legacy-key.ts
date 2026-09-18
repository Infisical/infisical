// Env-var key material for the legacy (pre-KMS) tier: project_bots,
// user_encryption_keys.serverEncryptedPrivateKey, secret_blind_indexes, org_bots. While those read
// process.env, rotating the env key strands every one of their rows, so the values are snapshotted into
// the database and served from here instead.

export type TLegacyKeySnapshot = {
  ENCRYPTION_KEY?: string;
  ROOT_ENCRYPTION_KEY?: string;
};

export type TLegacyKeyMaterial = {
  // Post-FIPS-relabel, what the legacy tier resolves today. Writes always use these.
  current: TLegacyKeySnapshot;
  // Pre-relabel. Decrypt-only fallback: the relabel can drop a key existing rows were written under.
  original?: TLegacyKeySnapshot;
};

let legacyKeyMaterial: TLegacyKeyMaterial | null = null;

export const setLegacyKeyMaterial = (material: TLegacyKeyMaterial) => {
  legacyKeyMaterial = material;
};

export const getLegacyKeyMaterial = () => legacyKeyMaterial;

export const resetLegacyKeyMaterial = () => {
  legacyKeyMaterial = null;
};

const hasAnyKey = (snapshot: TLegacyKeySnapshot | undefined): snapshot is TLegacyKeySnapshot =>
  Boolean(snapshot && (snapshot.ENCRYPTION_KEY || snapshot.ROOT_ENCRYPTION_KEY));

/** Empty means no snapshot is loaded yet: callers fall back to the environment. */
export const getLegacyDecryptionCandidates = (): TLegacyKeySnapshot[] => {
  if (!legacyKeyMaterial) return [];

  const candidates: TLegacyKeySnapshot[] = [];
  if (hasAnyKey(legacyKeyMaterial.current)) candidates.push(legacyKeyMaterial.current);

  const { original } = legacyKeyMaterial;
  if (
    hasAnyKey(original) &&
    (original.ENCRYPTION_KEY !== legacyKeyMaterial.current.ENCRYPTION_KEY ||
      original.ROOT_ENCRYPTION_KEY !== legacyKeyMaterial.current.ROOT_ENCRYPTION_KEY)
  ) {
    candidates.push(original);
  }

  return candidates;
};

/** Null means fall back to the environment. */
export const getLegacyEncryptionSnapshot = (): TLegacyKeySnapshot | null => {
  if (!legacyKeyMaterial || !hasAnyKey(legacyKeyMaterial.current)) return null;
  return legacyKeyMaterial.current;
};
