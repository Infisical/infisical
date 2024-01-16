import { TFolderSchema } from "./models";

export const folderBfsTraversal = async (
  root: TFolderSchema,
  callback: (
    data: TFolderSchema & { parentId: string | null },
  ) => void | Promise<void>,
) => {
  const queue = [root];
  while (queue.length) {
    const folder = queue.pop() as TFolderSchema & { parentId: null };
    callback(folder);
    queue.push(
      ...folder.children.map((el) => ({
        ...el,
        parentId: folder.id,
      })),
    );
  }
};

export const flattenFolders = (folders: TFolderSchema) => {
  const flattened: {
    id: string;
    parentId: string | null;
    name: string;
    version: number;
  }[] = [];
  folderBfsTraversal(folders, ({ name, version, parentId, id }) => {
    flattened.push({ name, version, parentId, id });
  });
  return flattened;
};
