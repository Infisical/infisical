import handlebars from "handlebars";

import { SecretSyncError } from "../secret-sync-errors";

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

const quoteSecretName = (key: string) => `'${key}'`;

const formatSecretNameList = (keys: string[]) => {
  const quoted = keys.map(quoteSecretName);
  if (quoted.length < 2) return quoted[0] ?? "";
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`;
  return `${quoted.slice(0, -1).join(", ")}, and ${quoted[quoted.length - 1]}`;
};

// Distinct Infisical names can collapse to one vault name (`foo_bar` and `foo-bar`). Writing
// both would silently overwrite whichever value landed last, so the sync reports every group.
export const assertUniqueAzureKeyVaultSecretNames = (infisicalKeys: Iterable<string>) => {
  const keysByAzureName = new Map<string, string[]>();

  for (const infisicalKey of infisicalKeys) {
    const azureKey = toAzureKeyVaultSecretName(infisicalKey);
    const group = keysByAzureName.get(azureKey);
    if (group) group.push(infisicalKey);
    else keysByAzureName.set(azureKey, [infisicalKey]);
  }

  const collisions = [...keysByAzureName.entries()].filter(([, keys]) => keys.length > 1);
  if (collisions.length === 0) return;

  const details = collisions
    .map(([azureKey, keys]) => {
      const verb = keys.length === 2 ? "both become" : "all become";
      return `${formatSecretNameList(keys)} ${verb} '${azureKey}'`;
    })
    .join(". ");

  throw new SecretSyncError({
    message: `These Infisical secret names would overwrite each other in Azure Key Vault, because each underscore is written as a hyphen. ${details}. Rename them so each vault name belongs to one secret.`,
    shouldRetry: false
  });
};
