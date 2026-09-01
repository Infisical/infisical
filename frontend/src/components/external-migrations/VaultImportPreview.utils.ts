export type TVaultImportPreviewRow = {
  key: string;
  depth: number;
  kind: "folder" | "secret";
  name: string;
  source?: string;
  title?: string;
};

export type TVaultImportPreview = {
  rows: TVaultImportPreviewRow[];
  headline: string;
  invalidPaths: string[];
};

type TBuildVaultImportPreviewArgs = {
  selectedPaths: string[];
  destinationPath: string;
  keepVaultStructure: boolean;
};

type TFolderNode = {
  children: Map<string, TFolderNode>;
  sources: string[];
};

// Vault only exposes paths at this stage, so leaf rows stand in for the real keys
const PLACEHOLDER_SECRET_COUNT = 2;

const VALID_FOLDER_SEGMENT = /^[a-zA-Z0-9_-]+$/;

const toSegments = (path: string) => path.split("/").filter(Boolean);

// a deep destination would otherwise push the source column off the row and bloat the headline
const MAX_VISIBLE_PATH_SEGMENTS = 3;

const formatDestination = (path: string) => {
  const segments = toSegments(path);

  if (segments.length <= MAX_VISIBLE_PATH_SEGMENTS) return `/${segments.join("/")}`;

  return `/${[segments[0], "...", segments[segments.length - 1]].join("/")}`;
};

const pluralizeFolders = (count: number) => `${count} folder${count === 1 ? "" : "s"}`;

const placeholderNames = (offset: number) =>
  Array.from({ length: PLACEHOLDER_SECRET_COUNT }, (_, index) => `secret_${offset + index + 1}`);

const createNode = (): TFolderNode => ({ children: new Map(), sources: [] });

export const buildVaultImportPreview = ({
  selectedPaths,
  destinationPath,
  keepVaultStructure
}: TBuildVaultImportPreviewArgs): TVaultImportPreview => {
  const fullDestination = `/${toSegments(destinationPath).join("/")}`;
  const destination = formatDestination(destinationPath);
  const rows: TVaultImportPreviewRow[] = [
    {
      key: "destination",
      depth: 0,
      kind: "folder",
      name: destination,
      title: fullDestination
    }
  ];

  if (!keepVaultStructure) {
    selectedPaths.forEach((vaultPath, pathIndex) => {
      placeholderNames(pathIndex * PLACEHOLDER_SECRET_COUNT).forEach((name, index) => {
        rows.push({
          key: `secret:${vaultPath}:${index}`,
          depth: 1,
          kind: "secret",
          name,
          source: vaultPath
        });
      });
    });

    return {
      rows,
      headline: `All secrets are flattened into ${destination}. Vault path structure is not preserved.`,
      invalidPaths: []
    };
  }

  const invalidPaths: string[] = [];
  const root = createNode();
  let folderCount = 0;

  selectedPaths.forEach((vaultPath) => {
    // the secrets engine leads the path and is dropped, matching buildVaultFolderImportPlan
    const [, ...relativeSegments] = toSegments(vaultPath);

    if (
      !relativeSegments.length ||
      relativeSegments.some((segment) => !VALID_FOLDER_SEGMENT.test(segment))
    ) {
      invalidPaths.push(vaultPath);
      return;
    }

    let node = root;
    relativeSegments.forEach((segment) => {
      let child = node.children.get(segment);

      if (!child) {
        child = createNode();
        node.children.set(segment, child);
        folderCount += 1;
      }

      node = child;
    });
    node.sources.push(vaultPath);
  });

  const walk = (node: TFolderNode, depth: number, prefix: string) => {
    [...node.children.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([name, child]) => {
        const path = `${prefix}/${name}`;

        rows.push({
          key: `folder:${path}`,
          depth,
          kind: "folder",
          name: `${name}/`
        });

        child.sources.forEach((source, sourceIndex) => {
          placeholderNames(sourceIndex * PLACEHOLDER_SECRET_COUNT).forEach((secretName, index) => {
            rows.push({
              key: `secret:${path}:${source}:${index}`,
              depth: depth + 1,
              kind: "secret",
              name: secretName,
              source
            });
          });
        });

        walk(child, depth + 1, path);
      });
  };

  walk(root, 1, "");

  const mirroredPathCount = selectedPaths.length - invalidPaths.length;

  return {
    rows,
    headline: `The Vault path${mirroredPathCount === 1 ? " becomes" : "s become"} ${pluralizeFolders(folderCount)} under ${destination}.`,
    invalidPaths
  };
};
