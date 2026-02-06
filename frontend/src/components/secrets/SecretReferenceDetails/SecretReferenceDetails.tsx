import { useEffect, useMemo } from "react";
import {
  StaticTreeDataProvider,
  Tree,
  TreeItem,
  TreeItemIndex,
  UncontrolledTreeEnvironment
} from "react-complex-tree";
import { faExclamationTriangle, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AxiosError } from "axios";

import { createNotification } from "@app/components/notifications";
import { FormControl, FormLabel, SecretInput, Spinner, Tooltip } from "@app/components/v2";
import { useProject } from "@app/context";
import { useGetSecretReferences, useGetSecretReferenceTree } from "@app/hooks/api";
import {
  ApiErrorTypes,
  TApiErrors,
  TSecretDependencyTreeNode,
  TSecretReferenceTraceNode
} from "@app/hooks/api/types";

import "./SecretReferenceTree.css";

type Props = {
  environment: string;
  secretPath: string;
  secretKey: string;
};

const INTERPOLATION_SYNTAX_REG = /\${([^}]+)}/;
export const hasSecretReference = (value: string | undefined) =>
  value ? INTERPOLATION_SYNTAX_REG.test(value) : false;

type TreeNodeData = {
  title: string;
  value?: string;
  rootValue?: string;
  isRoot?: boolean;
  isNested?: boolean;
};

const createNodeId = (node: TSecretReferenceTraceNode, parentId?: string): string => {
  const baseId = `${node.environment}:${node.secretPath}:${node.key}`;
  return parentId ? `${parentId}>${baseId}` : baseId;
};

// Convert TSecretReferenceTraceNode to react-complex-tree format
const convertToTreeItems = (
  node: TSecretReferenceTraceNode,
  secretKey: string,
  visitedPath: Set<string> = new Set(),
  parentId?: string
): Record<TreeItemIndex, TreeItem<TreeNodeData>> => {
  const items: Record<TreeItemIndex, TreeItem<TreeNodeData>> = {};
  const nodeId = createNodeId(node, parentId);

  // Check for circular reference
  const circularKey = `${node.environment}:${node.secretPath}:${node.key}`;
  const isCircular = visitedPath.has(circularKey);
  const newVisitedPath = new Set([...visitedPath, circularKey]);

  const displayName = parentId
    ? `${node.environment}${node.secretPath === "/" ? "" : node.secretPath.split("/").join(".")}.${node.key}`
    : secretKey;

  const childIds: TreeItemIndex[] = [];

  if (!isCircular) {
    node.children.forEach((child) => {
      const childId = createNodeId(child, nodeId);
      childIds.push(childId);
      const childItems = convertToTreeItems(child, secretKey, newVisitedPath, nodeId);
      Object.assign(items, childItems);
    });
  }

  items[nodeId] = {
    index: nodeId,
    isFolder: childIds.length > 0,
    children: childIds,
    data: {
      title: displayName,
      value: node.value,
      isRoot: !parentId
    }
  };

  // Add a hidden root container that has this node as its only child
  if (!parentId) {
    items.root = {
      index: "root",
      isFolder: true,
      children: [nodeId],
      data: { title: "root", isRoot: false }
    };
  }

  return items;
};

// Invert the dependency tree so leaf nodes become roots
// This transforms "A is referenced by B is referenced by C" into "C → B → A"
// which reads as "C references B which references A"
const invertDependencyTree = (tree: TSecretDependencyTreeNode): TSecretDependencyTreeNode[] => {
  // Collect all paths from root to leaves
  const paths: TSecretDependencyTreeNode[][] = [];

  const collectPaths = (
    node: TSecretDependencyTreeNode,
    currentPath: TSecretDependencyTreeNode[],
    visited: Set<string>
  ) => {
    const nodeKey = `${node.environment}:${node.secretPath}:${node.key}`;

    // if circular reference, save path up to this point (including circular node) and stop
    if (visited.has(nodeKey)) {
      if (currentPath.length > 0) {
        paths.push([...currentPath, node]);
      }
      return;
    }

    const newPath = [...currentPath, node];
    const newVisited = new Set([...visited, nodeKey]);

    if (node.children.length === 0) {
      // Leaf node - save this path
      paths.push(newPath);
    } else {
      // Continue traversing
      node.children.forEach((child) => collectPaths(child, newPath, newVisited));
    }
  };

  collectPaths(tree, [], new Set());

  // If no paths (only root with no children), return empty
  if (paths.length === 0) return [];

  // Build inverted trees from paths
  // Each path becomes a chain: leaf → ... → root
  const invertedRoots: Map<string, TSecretDependencyTreeNode> = new Map();

  paths.forEach((path) => {
    // Reverse the path so leaf is first, root is last
    const reversed = [...path].reverse();

    // Build the chain
    let currentNode: TSecretDependencyTreeNode | null = null;

    reversed.forEach((node, idx) => {
      const nodeKey = `${node.environment}:${node.secretPath}:${node.key}`;
      const isLeaf = idx === 0;

      if (isLeaf) {
        // Check if we already have this leaf as a root
        if (invertedRoots.has(nodeKey)) {
          currentNode = invertedRoots.get(nodeKey)!;
        } else {
          currentNode = {
            key: node.key,
            environment: node.environment,
            secretPath: node.secretPath,
            children: []
          };
          invertedRoots.set(nodeKey, currentNode);
        }
      } else if (currentNode) {
        // Check if this node already exists as a child
        const existingChild = currentNode.children.find(
          (c) =>
            c.key === node.key &&
            c.environment === node.environment &&
            c.secretPath === node.secretPath
        );

        if (existingChild) {
          currentNode = existingChild;
        } else {
          const newNode: TSecretDependencyTreeNode = {
            key: node.key,
            environment: node.environment,
            secretPath: node.secretPath,
            children: []
          };
          currentNode.children.push(newNode);
          currentNode = newNode;
        }
      }
    });
  });

  return Array.from(invertedRoots.values());
};

// Convert dependency tree from API to react-complex-tree format
// The tree is inverted so that leaf nodes (top-level dependents) are shown first
const convertDependencyTreeToItems = (
  tree: TSecretDependencyTreeNode,
  rootSecretKey: string
): { items: Record<TreeItemIndex, TreeItem<TreeNodeData>>; topLevelIds: string[] } => {
  const items: Record<TreeItemIndex, TreeItem<TreeNodeData>> = {};

  // Invert the tree so dependencies flow naturally (top → bottom)
  const invertedRoots = invertDependencyTree(tree);

  // If no dependents, return empty
  if (invertedRoots.length === 0) {
    return { items: {}, topLevelIds: [] };
  }

  const processNode = (
    node: TSecretDependencyTreeNode,
    parentId: string | undefined,
    depth: number,
    visited: Set<string>
  ): string => {
    const nodeKey = `${node.environment}:${node.secretPath}:${node.key}`;
    const nodeId = parentId ? `${parentId}>${nodeKey}` : nodeKey;

    // check if this is the original root secret (the one being viewed)
    const isOriginalRoot = node.key === rootSecretKey && depth > 0;
    const displayName = `${node.environment}${node.secretPath === "/" ? "" : node.secretPath.split("/").join(".")}.${node.key}`;

    // check for circular reference - still create the item but with no children
    if (visited.has(nodeKey)) {
      items[nodeId] = {
        index: nodeId,
        isFolder: false,
        children: [],
        data: {
          title: displayName,
          isRoot: isOriginalRoot,
          isNested: depth > 0
        }
      };
      return nodeId;
    }
    const newVisited = new Set([...visited, nodeKey]);

    const childIds: string[] = [];
    node.children.forEach((child) => {
      const childId = processNode(child, nodeId, depth + 1, newVisited);
      childIds.push(childId);
    });

    items[nodeId] = {
      index: nodeId,
      isFolder: childIds.length > 0,
      children: childIds,
      data: {
        title: displayName,
        isRoot: isOriginalRoot,
        isNested: depth > 0
      }
    };

    return nodeId;
  };

  const topLevelIds: string[] = [];
  invertedRoots.forEach((root) => {
    const rootId = processNode(root, undefined, 0, new Set());
    topLevelIds.push(rootId);
  });

  // Add hidden root container
  items.root = {
    index: "root",
    isFolder: true,
    children: topLevelIds,
    data: { title: "root", isRoot: false }
  };

  return { items, topLevelIds };
};

const hasCircularReferences = (
  node: TSecretReferenceTraceNode,
  visitedPath: Set<string> = new Set()
): boolean => {
  const nodeId = `${node.environment}:${node.secretPath}:${node.key}`;

  if (visitedPath.has(nodeId)) {
    return true;
  }

  const newVisitedPath = new Set([...visitedPath, nodeId]);
  return node.children.some((child) => hasCircularReferences(child, newVisitedPath));
};

// Custom tree item renderer
const renderItemTitle = ({
  item,
  isDependency
}: {
  item: TreeItem<TreeNodeData>;
  isDependency?: boolean;
}) => {
  const { title, value, isRoot } = item.data;

  return (
    <span className="flex items-center gap-1">
      <span className={isRoot ? "font-medium" : ""}>{title}</span>
      {!isDependency && (
        <Tooltip className="max-w-md break-words" content={value || "No value"}>
          <span className={`px-1 text-xs ${value ? "text-mineshaft-400" : "text-red-400"}`}>
            <FontAwesomeIcon icon={value ? faEye : faEyeSlash} size="sm" />
          </span>
        </Tooltip>
      )}
    </span>
  );
};

const SecretTree = ({
  isDependency,
  items,
  rootId,
  treeId,
  defaultExpandedIds = []
}: {
  isDependency?: boolean;
  items: Record<TreeItemIndex, TreeItem<TreeNodeData>>;
  rootId: string;
  treeId: string;
  defaultExpandedIds?: string[];
}) => {
  const dataProvider = useMemo(
    () =>
      new StaticTreeDataProvider(items, (item, newName) => ({
        ...item,
        data: { ...item.data, title: newName }
      })),
    [items]
  );

  return (
    <UncontrolledTreeEnvironment
      dataProvider={dataProvider}
      getItemTitle={(item) => item.data.title}
      viewState={{
        [treeId]: {
          expandedItems: defaultExpandedIds
        }
      }}
      canDragAndDrop={false}
      canDropOnFolder={false}
      canReorderItems={false}
      renderItemTitle={(props) => renderItemTitle({ ...props, isDependency })}
    >
      <Tree treeId={treeId} rootItem={rootId} />
    </UncontrolledTreeEnvironment>
  );
};

const SecretDependencyTree = ({ secretPath, environment, secretKey }: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const { data, isPending, isError, error } = useGetSecretReferences(
    {
      secretPath,
      environment,
      projectId,
      secretKey
    },
    { enabled: Boolean(projectId && environment && secretPath && secretKey) }
  );

  const tree = data?.tree;

  const treeItems = useMemo(() => {
    if (!tree) return { items: {}, rootId: "", topLevelIds: [] };
    const { items, topLevelIds } = convertDependencyTreeToItems(tree, secretKey);
    return { items, rootId: "root", topLevelIds };
  }, [tree, secretKey]);

  useEffect(() => {
    if (error instanceof AxiosError) {
      const err = error?.response?.data as TApiErrors;

      if (err?.error === ApiErrorTypes.CustomForbiddenError) {
        createNotification({
          title: "You don't have permission to view dependency tree",
          text: "You don't have permission to view one or more of the dependent secrets.",
          type: "error"
        });
        return;
      }
      createNotification({
        title: "Error fetching secret dependency tree",
        text: "Please try again later.",
        type: "error"
      });
    }
  }, [error]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner className="text-mineshaft-400" />
      </div>
    );
  }

  const hasDependencies = tree && tree.children?.length > 0;

  if (!hasDependencies) {
    return (
      <div className="flex items-center justify-center py-4">
        <span className="text-mineshaft-400">No secrets reference this secret</span>
      </div>
    );
  }

  return (
    <div>
      <div className="secret-tree-container relative max-h-96 thin-scrollbar overflow-auto rounded-md border border-mineshaft-600 bg-bunker-700 p-3 text-sm text-mineshaft-200">
        {isError && (
          <div className="flex items-center justify-center py-4">
            <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2 text-red-500" />
            <p className="text-red-500">Error fetching secret dependency tree</p>
          </div>
        )}
        {!isError && treeItems.rootId && (
          <SecretTree
            isDependency
            items={treeItems.items}
            rootId={treeItems.rootId}
            treeId="dependency-tree"
            defaultExpandedIds={treeItems.topLevelIds}
          />
        )}
      </div>
      <div className="mt-2 text-xs text-mineshaft-400">
        Shows secrets that depend on this secret. Each level references the one below it.
      </div>
    </div>
  );
};

export const SecretReferenceTree = ({ secretPath, environment, secretKey }: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const { data, isPending, isError, error } = useGetSecretReferenceTree({
    secretPath,
    environmentSlug: environment,
    projectId,
    secretKey
  });

  const tree = data?.tree;
  const secretValue = data?.value;

  const hasCirculars = tree ? hasCircularReferences(tree) : false;

  const treeItems = useMemo(() => {
    if (!tree) return { items: {}, rootId: "", expandId: "" };
    const items = convertToTreeItems(tree, secretKey);
    const actualRootId = createNodeId(tree);
    // Return "root" as rootId since that's the container, and actualRootId for expanding
    return { items, rootId: "root", expandId: actualRootId };
  }, [tree, secretKey]);

  useEffect(() => {
    if (error instanceof AxiosError) {
      const err = error?.response?.data as TApiErrors;

      if (err?.error === ApiErrorTypes.CustomForbiddenError) {
        createNotification({
          title: "You don't have permission to view reference tree",
          text: "You don't have permission to view one or more of the referenced secrets.",
          type: "error"
        });
        return;
      }
      createNotification({
        title: "Error fetching secret reference tree",
        text: "Please try again later.",
        type: "error"
      });
    }
  }, [error]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner className="text-mineshaft-400" />
      </div>
    );
  }

  const hasReferences = tree && tree.children?.length > 0;

  return (
    <div>
      <FormControl
        label="Expanded value"
        tooltipText={
          hasCirculars
            ? "This secret contains circular references. Value shown is resolved once, with circular paths truncated in the reference tree below."
            : undefined
        }
        tooltipClassName="max-w-md break-words"
      >
        <SecretInput
          key="value-overriden"
          isReadOnly
          value={secretValue}
          containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-bunker-700 px-2 py-1.5"
        />
      </FormControl>

      <FormLabel
        tooltipText="Overview of all secrets across your project that this secret references. Note that you are only able to view the references that you have access to."
        className="mb-2"
        label="Reference Tree"
      />
      <div className="secret-tree-container relative max-h-96 thin-scrollbar overflow-auto rounded-md border border-mineshaft-600 bg-bunker-700 p-3 text-sm text-mineshaft-200">
        {isError && (
          <div className="flex items-center justify-center py-4">
            <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2 text-red-500" />
            <p className="text-red-500">Error fetching secret reference tree</p>
          </div>
        )}
        {!isError && hasReferences && treeItems.rootId && (
          <SecretTree
            items={treeItems.items}
            rootId={treeItems.rootId}
            treeId="reference-tree"
            defaultExpandedIds={[treeItems.expandId]}
          />
        )}
        {!isError && !hasReferences && (
          <div className="flex items-center justify-center py-4">
            <span className="text-mineshaft-400">This secret does not contain references</span>
          </div>
        )}
      </div>
      <div className="mt-2 text-xs text-mineshaft-400">
        Click a secret key to view its sub-references.
      </div>

      <FormLabel
        tooltipText="Overview of all secrets across your project that this secret is referenced by. Note that you are only able to view the references that you have access to."
        className="mt-6 mb-2"
        label="Dependency Tree"
      />
      <SecretDependencyTree
        secretPath={secretPath}
        environment={environment}
        secretKey={secretKey}
      />
    </div>
  );
};
