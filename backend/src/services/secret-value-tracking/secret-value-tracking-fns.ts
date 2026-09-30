export const needsBackfill = (row: {
  secretValueBlindIndex?: string | null;
  secretValueOrgBlindIndex?: string | null;
  encryptedValue?: Buffer | null;
}) => Boolean(row.encryptedValue) && (!row.secretValueBlindIndex || !row.secretValueOrgBlindIndex);
