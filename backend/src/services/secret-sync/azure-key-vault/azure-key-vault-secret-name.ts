import handlebars from "handlebars";

// Azure Key Vault secret names allow hyphens and reject underscores. Infisical names may use
// either character, so an imported vault name is stored unchanged. Sync still rewrites each
// underscore to a hyphen on the way out, because that is the only form Key Vault accepts.
// Two Infisical names that differ only by that substitution refer to the same vault secret,
// which keeps names imported before this change (hyphens rewritten to underscores) matched.

export const toAzureKeyVaultSecretName = (infisicalKey: string) => infisicalKey.replaceAll("_", "-");

// Key schemas are written with Infisical separators, often underscores. Those separators are
// hyphens in the vault. Put the separators back so schema stripping removes only the wrapper
// and leaves hyphens that belong to the secret name.
export const infisicalImportKeyFromAzureKeyVaultName = (azureKey: string, environment: string, schema?: string) => {
  if (!schema) return azureKey;

  const compiledSchema = handlebars.compile(schema)({
    secretKey: "{{secretKey}}",
    environment
  });
  const infisicalParts = compiledSchema.split("{{secretKey}}");
  const infisicalPrefix = infisicalParts[0];
  const infisicalSuffix = infisicalParts[infisicalParts.length - 1];

  const azureSchema = toAzureKeyVaultSecretName(compiledSchema);
  const azureParts = azureSchema.split("{{secretKey}}");
  const azurePrefix = azureParts[0];
  const azureSuffix = azureParts[azureParts.length - 1];

  if (!azureKey.startsWith(azurePrefix) || !azureKey.endsWith(azureSuffix)) return azureKey;
  if (azureKey.length < azurePrefix.length + azureSuffix.length) return azureKey;

  const secretPortion = azureKey.slice(
    azurePrefix.length,
    azureSuffix.length > 0 ? azureKey.length - azureSuffix.length : undefined
  );

  return `${infisicalPrefix}${secretPortion}${infisicalSuffix}`;
};

export const findInfisicalSecretKeyForAzureKeyVaultName = (azureKey: string, secretMap: object): string | undefined => {
  if (Object.hasOwn(secretMap, azureKey)) return azureKey;

  return Object.keys(secretMap).find((infisicalKey) => toAzureKeyVaultSecretName(infisicalKey) === azureKey);
};

// Re-import updates a secret already stored under the older underscored name instead of
// creating a second secret. A vault name with no match is kept as-is, hyphens included.
export const resolveAzureKeyVaultImportedSecretKey = (azureKey: string, existingSecrets: object) =>
  findInfisicalSecretKeyForAzureKeyVaultName(azureKey, existingSecrets) ?? azureKey;
