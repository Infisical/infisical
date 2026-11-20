export type FileTreeNode =
  | { type: "folder"; name: string; path: string; children: FileTreeNode[] }
  | { type: "file"; name: string; path: string };

type FolderNode = Extract<FileTreeNode, { type: "folder" }>;

/**
 * Turns slash-separated file paths into nested folders. Folders come first, sorted by name; files keep the order they
 * were given in. `emptyFolders` adds folders that hold no file.
 */
export const buildFileTree = (
  paths: readonly string[],
  emptyFolders: readonly string[] = []
): FileTreeNode[] => {
  const root: FolderNode = { type: "folder", name: "", path: "", children: [] };
  const folders = new Map<string, FolderNode>([["", root]]);

  const addFolders = (segments: string[]) => {
    let parent = root;
    segments.forEach((name) => {
      const folderPath = parent.path ? `${parent.path}/${name}` : name;
      let folder = folders.get(folderPath);
      if (!folder) {
        folder = { type: "folder", name, path: folderPath, children: [] };
        folders.set(folderPath, folder);
        parent.children.push(folder);
      }
      parent = folder;
    });
    return parent;
  };

  emptyFolders.forEach((path) => addFolders(path.split("/").filter(Boolean)));
  paths.forEach((path) => {
    const segments = path.split("/").filter(Boolean);
    const parent = addFolders(segments.slice(0, -1));
    const name = segments[segments.length - 1];
    if (name) parent.children.push({ type: "file", name, path });
  });

  const order = (nodes: FileTreeNode[]): FileTreeNode[] => {
    const folderNodes = nodes
      .filter((node): node is FolderNode => node.type === "folder")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((folder) => ({ ...folder, children: order(folder.children) }));
    return [...folderNodes, ...nodes.filter((node) => node.type === "file")];
  };

  return order(root.children);
};

/** The folders that contain a path, outermost first: `a/b/c.txt` gives `a` and `a/b`. */
export const getAncestorFolders = (path: string) => {
  const segments = path.split("/").filter(Boolean);
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
};
