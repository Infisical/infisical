export const isAzureKeyVaultReference = (uri: string) => {
  const tryJsonDecode = () => {
    try {
      return (JSON.parse(uri) as { uri: string }).uri || uri;
    } catch {
      return uri;
    }
  };

  const cleanUri = tryJsonDecode();

  if (!cleanUri.startsWith("https://")) {
    return false;
  }

  if (!cleanUri.includes(".vault.azure.net/secrets/")) {
    return false;
  }

  // 3. Check for non-empty string between https:// and .vault.azure.net/secrets/
  const parts = cleanUri.split(".vault.azure.net/secrets/");
  const vaultName = parts[0].replace("https://", "");
  if (!vaultName) {
    return false;
  }

  // 4. Check for non-empty secret name
  const secretParts = parts[1].split("/");
  const secretName = secretParts[0];
  if (!secretName) {
    return false;
  }

  return true;
};
