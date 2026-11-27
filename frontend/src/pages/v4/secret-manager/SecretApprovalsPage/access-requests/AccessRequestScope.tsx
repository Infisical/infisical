import type { ReactNode } from "react";
import { Card } from "@infisical/cipher/ui/card";
import { FileTree, type FileTreeNode } from "@infisical/cipher/ui/file-tree";
import { StatusText } from "@infisical/cipher/ui/text";

import { useV4Adapter } from "../../../data/adapters";
import { buildFolderTree, type FolderTreeNode, getMatchingFolders } from "./scope";

const toTreeItems = (nodes: FolderTreeNode[]): FileTreeNode[] =>
  nodes.map((node) =>
    node.children.length
      ? {
          id: node.path,
          name: node.label,
          label: node.path,
          type: "folder",
          children: toTreeItems(node.children)
        }
      : { id: node.path, name: node.label, label: node.path, icon: "folder" }
  );

export const AccessRequestScope = ({
  projectId,
  environment,
  secretPath
}: {
  projectId: string;
  environment: string;
  secretPath: string;
}) => {
  const { data: folderPaths, error } = useV4Adapter("accessApprovals").useEnvironmentFolderPaths({
    projectId,
    environment,
    enabled: true
  });

  let content: ReactNode = (
    <StatusText tone="neutral" loading>
      Loading folders
    </StatusText>
  );
  if (error)
    content = (
      <StatusText tone="bad" icon="alert-c">
        Couldn&apos;t load the folders this path matches.
      </StatusText>
    );
  else if (folderPaths) {
    const tree = buildFolderTree(getMatchingFolders(secretPath, folderPaths));
    content = (
      <FileTree
        label="Folders granted"
        items={toTreeItems(tree)}
        defaultExpanded={tree.length === 1 && tree[0].children.length ? [tree[0].path] : []}
        selectable="none"
        size="sm"
        maxHeight={256}
        truncate="end"
        empty="No folders match this path."
      />
    );
  }

  return (
    <Card variant="framed" size="sm">
      {content}
    </Card>
  );
};
