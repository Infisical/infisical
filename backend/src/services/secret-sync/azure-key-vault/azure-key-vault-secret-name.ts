import handlebars from "handlebars";

import { SecretSyncError } from "../secret-sync-errors";

export const toAzureKeyVaultSecretName = (infisicalKey: string) => infisicalKey.replaceAll("_", "-");

export const normalizeAzureKeyVaultSecretName = (name: string) => toAzureKeyVaultSecretName(name).toLowerCase();

export const infisicalImportKeyFromAzureKeyVaultName = (azureKey: string, environment: string, schema?: string) => {
  if (!schema) return azureKey;

  const compiledSchema = handlebars.compile(schema)({
    secretKey: "{{secretKey}}",
    environment
  });
  const infisicalParts = compiledSchema.split("{{secretKey}}");
  const infisicalPrefix = infisicalParts[0];
  const infisicalSuffix = infisicalParts[infisicalParts.length - 1];

  const azureSchema = normalizeAzureKeyVaultSecretName(compiledSchema);
  const azureParts = azureSchema.split("{{secretkey}}");
  const azurePrefix = azureParts[0];
  const azureSuffix = azureParts[azureParts.length - 1];
  const normalizedAzureKey = azureKey.toLowerCase();

  if (!normalizedAzureKey.startsWith(azurePrefix) || !normalizedAzureKey.endsWith(azureSuffix)) return azureKey;
  if (azureKey.length < azurePrefix.length + azureSuffix.length) return azureKey;

  const secretPortion = azureKey.slice(
    azurePrefix.length,
    azureSuffix.length > 0 ? azureKey.length - azureSuffix.length : undefined
  );

  return `${infisicalPrefix}${secretPortion}${infisicalSuffix}`;
};

export const findInfisicalSecretKeyForAzureKeyVaultName = (azureKey: string, secretMap: object): string | undefined => {
  if (Object.hasOwn(secretMap, azureKey)) return azureKey;

  const normalizedAzureKey = normalizeAzureKeyVaultSecretName(azureKey);
  return Object.keys(secretMap).find(
    (infisicalKey) => normalizeAzureKeyVaultSecretName(infisicalKey) === normalizedAzureKey
  );
};

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
    const azureKey = normalizeAzureKeyVaultSecretName(infisicalKey);
    const group = keysByAzureName.get(azureKey);
    if (group) group.push(infisicalKey);
    else keysByAzureName.set(azureKey, [infisicalKey]);
  }

  const collisions = [...keysByAzureName.values()].filter((keys) => keys.length > 1);
  if (collisions.length === 0) return;

  const details = collisions
    .map((keys) => {
      const verb = keys.length === 2 ? "both become" : "all become";
      return `${formatSecretNameList(keys)} ${verb} '${toAzureKeyVaultSecretName(keys[0])}'`;
    })
    .join(". ");

  throw new SecretSyncError({
    message: `These Infisical secret names would overwrite each other in Azure Key Vault, because each underscore is written as a hyphen and vault names ignore case. ${details}. Rename them so each vault name belongs to one secret.`,
    shouldRetry: false
  });
};
