import type { Resource, Secret } from "../../secrets-model";

type Folder = Extract<Resource, { kind: "folder" }>;
const childPath = (path: string, name: string) => `${path === "/" ? "" : path}/${name}`;

export const isPathInsideFolder = (destinationPath: string, folderPath: string) =>
  destinationPath === folderPath || destinationPath.startsWith(`${folderPath}/`);

export const relocate = <R extends Resource>(
  resource: R,
  environment: string,
  path: string
): R => ({
  ...resource,
  environment,
  path,
  updatedAt: new Date().toISOString()
});

export const moveFolderResources = (
  current: Resource[],
  folder: Pick<Folder, "project" | "path" | "name">,
  moves: { environment: string; destinationEnvironment: string }[],
  destinationPath: string
) => {
  const folderPath = childPath(folder.path, folder.name);
  const target = childPath(destinationPath, folder.name);
  return current.map((resource) => {
    const move = moves.find((entry) => entry.environment === resource.environment);
    if (!move || resource.project !== folder.project) return resource;
    const isRoot =
      resource.kind === "folder" && resource.path === folder.path && resource.name === folder.name;
    if (!isRoot && !isPathInsideFolder(resource.path, folderPath)) return resource;
    return relocate(
      resource,
      move.destinationEnvironment,
      isRoot ? destinationPath : `${target}${resource.path.slice(folderPath.length)}`
    );
  });
};

export const planSecretMove = (
  current: Resource[],
  {
    project,
    sourceEnvironment,
    sourcePath,
    destinationEnvironment,
    destinationPath,
    names,
    shouldOverwrite
  }: {
    project: string;
    sourceEnvironment: string;
    sourcePath: string;
    destinationEnvironment: string;
    destinationPath: string;
    names: string[];
    shouldOverwrite: boolean;
  }
): { next: Resource[] } | { error: string } => {
  const at = (resource: Resource, environment: string, path: string) =>
    resource.project === project && resource.environment === environment && resource.path === path;
  const sources = current.filter(
    (resource): resource is Secret =>
      resource.kind === "secret" &&
      at(resource, sourceEnvironment, sourcePath) &&
      names.includes(resource.name)
  );
  const existing = new Map(
    current
      .filter(
        (resource): resource is Secret =>
          resource.kind === "secret" && at(resource, destinationEnvironment, destinationPath)
      )
      .map((secret) => [secret.name, secret])
  );
  const rotationKeys = sources.filter(({ name }) => existing.get(name)?.managedBy);
  if (rotationKeys.length)
    return {
      error: `Cannot move secrets to '${destinationPath}' because the following keys are managed by a secret rotation at the destination: ${rotationKeys.map(({ name }) => name).join(", ")}`
    };
  const honeyKeys = sources.filter(({ name }) => existing.get(name)?.honeyToken);
  if (honeyKeys.length)
    return {
      error: `Cannot move secrets to '${destinationPath}' because the following keys are managed by a honey token at the destination: ${honeyKeys.map(({ name }) => name).join(", ")}`
    };
  const conflicts = sources.filter(({ name }) => existing.has(name));
  if (conflicts.length && !shouldOverwrite)
    return {
      error: `Failed to move secrets. The following secrets already exist in the destination: ${conflicts.map(({ name }) => name).join(",")}`
    };
  const moving = new Set(sources.map(({ id }) => id));
  return {
    next: current.map((resource) =>
      moving.has(resource.id)
        ? relocate(resource, destinationEnvironment, destinationPath)
        : resource
    )
  };
};
