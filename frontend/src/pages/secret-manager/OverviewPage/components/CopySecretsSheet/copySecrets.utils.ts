import type {
  CopySecretsEnvironment,
  CopySecretsMode,
  CopySecretsSource
} from "./copySecrets.types";

export const getOtherCopyEnvironmentSlug = (
  environments: CopySecretsEnvironment[],
  excludedSlug: string
) => environments.find(({ slug }) => slug !== excludedSlug)?.slug ?? "";

export const normalizeCopyPath = (path: string) => {
  const segments = path.trim().split("/").filter(Boolean);
  return segments.length ? `/${segments.join("/")}` : "/";
};

export const joinCopyPath = (...paths: string[]) =>
  normalizeCopyPath(
    paths
      .flatMap((path) => path.split("/"))
      .filter(Boolean)
      .join("/")
  );

export const getCopyPathName = (path: string) =>
  normalizeCopyPath(path).split("/").filter(Boolean).at(-1);

export const getRelativeCopyPath = (path: string, rootPath: string) => {
  const normalizedPath = normalizeCopyPath(path);
  const normalizedRoot = normalizeCopyPath(rootPath);

  if (normalizedPath === normalizedRoot) return "/";
  if (normalizedRoot === "/") return normalizedPath;
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) return null;
  return normalizeCopyPath(normalizedPath.slice(normalizedRoot.length));
};

export const filterCopyPreviewSecrets = ({
  secrets,
  rootPath,
  changesOnly = false
}: {
  secrets: CopySecretsSource[];
  rootPath: string;
  changesOnly?: boolean;
}) =>
  secrets.filter(
    (secret) =>
      getRelativeCopyPath(secret.path, rootPath) !== null &&
      (!changesOnly || Boolean(secret.previewStatus))
  );

export const getCopyDestinationPath = ({
  sourcePath,
  sourceRootPath,
  destinationRootPath,
  mode
}: {
  sourcePath: string;
  sourceRootPath: string;
  destinationRootPath: string;
  mode: CopySecretsMode;
}) => {
  const relativePath = getRelativeCopyPath(sourcePath, sourceRootPath);
  if (relativePath === null) return null;

  const sourceFolderName = mode === "folder" ? getCopyPathName(sourceRootPath) : undefined;
  return joinCopyPath(destinationRootPath, sourceFolderName ?? "", relativePath);
};

export type CopySecretsRequestGroup = {
  sourcePath: string;
  destinationPath: string;
  secretIds: string[];
};

export type CopySecretConflict = {
  sourceSecretId: string;
  name: string;
  destinationPath: string;
};

export const getCopySecretConflicts = ({
  secrets,
  destinationSecrets,
  requestGroups
}: {
  secrets: CopySecretsSource[];
  destinationSecrets: CopySecretsSource[];
  requestGroups: CopySecretsRequestGroup[];
}) => {
  const destinationPathBySourcePath = new Map(
    requestGroups.map(({ sourcePath, destinationPath }) => [
      normalizeCopyPath(sourcePath),
      normalizeCopyPath(destinationPath)
    ])
  );
  const destinationLocations = new Set(
    destinationSecrets.map(({ path, name }) => `${normalizeCopyPath(path)}\u0000${name}`)
  );

  return secrets.flatMap<CopySecretConflict>((secret) => {
    const destinationPath = destinationPathBySourcePath.get(normalizeCopyPath(secret.path));
    if (!destinationPath || !destinationLocations.has(`${destinationPath}\u0000${secret.name}`)) {
      return [];
    }

    return [{ sourceSecretId: secret.id, name: secret.name, destinationPath }];
  });
};

export const groupCopySecretsRequests = ({
  secrets,
  sourceRootPath,
  destinationRootPath,
  mode
}: {
  secrets: CopySecretsSource[];
  sourceRootPath: string;
  destinationRootPath: string;
  mode: CopySecretsMode;
}) => {
  const groups = new Map<string, CopySecretsRequestGroup>();

  secrets.forEach((secret) => {
    const sourcePath = normalizeCopyPath(secret.path);
    const destinationPath = getCopyDestinationPath({
      sourcePath,
      sourceRootPath,
      destinationRootPath,
      mode
    });
    if (!destinationPath) return;

    const key = `${sourcePath}\u0000${destinationPath}`;
    const group = groups.get(key) ?? { sourcePath, destinationPath, secretIds: [] };
    group.secretIds.push(secret.id);
    groups.set(key, group);
  });

  return [...groups.values()];
};

export const chunkCopySecretIds = (secretIds: string[], size = 50) =>
  Array.from({ length: Math.ceil(secretIds.length / size) }, (_, index) =>
    secretIds.slice(index * size, (index + 1) * size)
  );
