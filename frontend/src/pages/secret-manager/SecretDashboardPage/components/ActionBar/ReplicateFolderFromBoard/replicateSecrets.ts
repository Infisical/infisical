export const normalizeSecretPath = (path: string) => {
  const trimmedPath = path.trim();

  if (!trimmedPath) return "/";

  const pathWithLeadingSlash = trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`;
  const normalizedPath = pathWithLeadingSlash.replace(/\/+$/u, "");

  return normalizedPath || "/";
};

export const isSecretPathSettled = (sourcePath: string, displayedSourcePath: string) =>
  normalizeSecretPath(sourcePath) === normalizeSecretPath(displayedSourcePath);

export const reconcileSelectedSecrets = <T extends { id: string }>(
  selectedSecrets: ReadonlyArray<{ id: string }>,
  availableSecrets: readonly T[]
) => {
  const availableSecretsById = new Map(
    availableSecrets.map((secret) => [secret.id, secret] as const)
  );

  return selectedSecrets.flatMap(({ id }) => {
    const availableSecret = availableSecretsById.get(id);

    return availableSecret ? [availableSecret] : [];
  });
};

export const getRelativeSecretPath = (secretPath: string, sourceRootPath: string) => {
  const normalizedSecretPath = normalizeSecretPath(secretPath);
  const normalizedSourceRootPath = normalizeSecretPath(sourceRootPath);

  if (normalizedSecretPath === normalizedSourceRootPath) return "/";
  if (normalizedSourceRootPath === "/") return normalizedSecretPath;
  if (normalizedSecretPath.startsWith(`${normalizedSourceRootPath}/`)) {
    return normalizedSecretPath.slice(normalizedSourceRootPath.length);
  }

  return normalizedSecretPath;
};

export const getDestinationSecretPath = (destinationRootPath: string, relativePath: string) => {
  const normalizedDestinationRootPath = normalizeSecretPath(destinationRootPath);
  const normalizedRelativePath = normalizeSecretPath(relativePath);

  if (normalizedRelativePath === "/") return normalizedDestinationRootPath;

  const destinationPrefix =
    normalizedDestinationRootPath === "/" ? "" : normalizedDestinationRootPath;

  return normalizeSecretPath(`${destinationPrefix}/${normalizedRelativePath.slice(1)}`);
};

export const getSecretLocation = (secretPath: string, secretKey: string) => {
  const normalizedSecretPath = normalizeSecretPath(secretPath);
  const pathPrefix = normalizedSecretPath === "/" ? "" : normalizedSecretPath;

  return `${pathPrefix}/${secretKey}`;
};
