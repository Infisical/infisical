import type {
  CopySecretsEnvironment,
  CopySecretsFolder,
  CopySecretsInvocation,
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

export const isCopySecretSelectable = (secret: CopySecretsSource) =>
  !secret.isRotated && !secret.isHoneyToken;

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

export const isCopyingToSameLocation = ({
  sourceEnvironment,
  destinationEnvironment,
  sourcePath,
  destinationPath,
  mode
}: {
  sourceEnvironment: string;
  destinationEnvironment: string;
  sourcePath: string;
  destinationPath: string;
  mode: CopySecretsMode;
}) =>
  sourceEnvironment === destinationEnvironment &&
  getCopyDestinationPath({
    sourcePath,
    sourceRootPath: sourcePath,
    destinationRootPath: destinationPath,
    mode
  }) === normalizeCopyPath(sourcePath);

export type CopyFolderCreationStep = {
  parentPath: string;
  name: string;
};

export const getCopyFolderCreationSteps = (path: string) => {
  let parentPath = "/";

  return normalizeCopyPath(path)
    .split("/")
    .filter(Boolean)
    .map<CopyFolderCreationStep>((name) => {
      const step = { parentPath, name };
      parentPath = joinCopyPath(parentPath, name);
      return step;
    });
};

export type CopySecretsRequestGroup = {
  sourcePath: string;
  destinationPath: string;
  secretIds: string[];
  includeValues: boolean;
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
  mode,
  includeValues = true
}: {
  secrets: CopySecretsSource[];
  sourceRootPath: string;
  destinationRootPath: string;
  mode: CopySecretsMode;
  includeValues?: boolean;
}) => {
  const groups = new Map<string, CopySecretsRequestGroup>();

  secrets.forEach((secret) => {
    if (!isCopySecretSelectable(secret)) return;
    const sourcePath = normalizeCopyPath(secret.path);
    const destinationPath = getCopyDestinationPath({
      sourcePath,
      sourceRootPath,
      destinationRootPath,
      mode
    });
    if (!destinationPath) return;

    const copyValue = includeValues && !secret.isValueHidden;
    const key = `${sourcePath}\u0000${destinationPath}\u0000${copyValue}`;
    const group = groups.get(key) ?? {
      sourcePath,
      destinationPath,
      secretIds: [],
      includeValues: copyValue
    };
    group.secretIds.push(secret.id);
    groups.set(key, group);
  });

  return [...groups.values()];
};

export const chunkCopySecretIds = (secretIds: string[], size = 50) =>
  Array.from({ length: Math.ceil(secretIds.length / size) }, (_, index) =>
    secretIds.slice(index * size, (index + 1) * size)
  );

export const getInitialCopyState = (
  invocation: CopySecretsInvocation,
  environments: CopySecretsEnvironment[]
) => {
  const availableSlugs =
    invocation.origin === "bulk"
      ? [
          ...new Set([
            ...Object.keys(invocation.secretsByEnvironment),
            ...Object.keys(invocation.foldersByEnvironment)
          ])
        ]
      : [];
  const sourceEnvironmentSlug =
    invocation.sourceEnvironmentSlug ?? (availableSlugs.length === 1 ? availableSlugs[0] : "");
  return {
    sourceEnvironmentSlug,
    sourcePath: invocation.sourcePath,
    destinationEnvironmentSlug: sourceEnvironmentSlug
      ? getOtherCopyEnvironmentSlug(environments, sourceEnvironmentSlug) || sourceEnvironmentSlug
      : "",
    destinationPath: "/",
    mode: (invocation.origin === "toolbar" && getCopyPathName(invocation.sourcePath)
      ? "folder"
      : "contents") as CopySecretsMode
  };
};

export const getInvocationCopySelection = ({
  invocation,
  sourcePath,
  secrets,
  folders
}: {
  invocation: CopySecretsInvocation;
  sourcePath: string;
  secrets: CopySecretsSource[];
  folders: CopySecretsFolder[];
}) => {
  let invocationSecrets: CopySecretsSource[] = [];
  if (invocation.origin === "row") invocationSecrets = invocation.secrets;
  if (invocation.origin === "bulk")
    invocationSecrets = Object.values(invocation.secretsByEnvironment).flat();
  const names = new Set(invocationSecrets.map(({ name }) => name));
  const folderRoots =
    invocation.origin === "bulk"
      ? invocation.folderNames.map((name) => joinCopyPath(sourcePath, name))
      : [];
  const isInSelectedFolder = (path: string) =>
    folderRoots.some((root) => getRelativeCopyPath(path, root) !== null);
  return {
    secretIds: secrets
      .filter(
        (secret) =>
          isCopySecretSelectable(secret) &&
          ((normalizeCopyPath(secret.path) === normalizeCopyPath(sourcePath) &&
            names.has(secret.name)) ||
            isInSelectedFolder(secret.path))
      )
      .map(({ id }) => id),
    folderPaths: folders.filter(({ path }) => isInSelectedFolder(path)).map(({ path }) => path)
  };
};

export const getCopyDestinationFolderPaths = ({
  folderPaths,
  sourceRootPath,
  destinationRootPath,
  mode
}: {
  folderPaths: string[];
  sourceRootPath: string;
  destinationRootPath: string;
  mode: CopySecretsMode;
}) => [
  ...new Set(
    folderPaths.flatMap((sourcePath) => {
      const path = getCopyDestinationPath({
        sourcePath,
        sourceRootPath,
        destinationRootPath,
        mode
      });
      return path ? [path] : [];
    })
  )
];
