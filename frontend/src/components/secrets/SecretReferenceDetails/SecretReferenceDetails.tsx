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
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  ReactFlow,
  ReactFlowProvider
} from "@xyflow/react";
import { AxiosError } from "axios";

import { createNotification } from "@app/components/notifications";
import { FormControl, FormLabel, SecretInput, Spinner, Tooltip } from "@app/components/v2";
import { useProject } from "@app/context";
import { useGetSecretReferences, useGetSecretReferenceTree } from "@app/hooks/api";
import { ApiErrorTypes, TApiErrors, TSecretReferenceTraceNode } from "@app/hooks/api/types";

import { SecretReferenceEdge } from "./edges/SecretReferenceEdge";
import { SecretNode } from "./nodes/SecretNode";
import { convertDependencyTreeToFlow } from "./utils/convertToFlowElements";

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

const convertToTreeItems = (
  node: TSecretReferenceTraceNode,
  secretKey: string,
  visitedPath: Set<string> = new Set(),
  parentId?: string
): Record<TreeItemIndex, TreeItem<TreeNodeData>> => {
  const items: Record<TreeItemIndex, TreeItem<TreeNodeData>> = {};
  const nodeId = createNodeId(node, parentId);

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

const renderItemTitle = ({ item }: { item: TreeItem<TreeNodeData> }) => {
  const { title, value, isRoot } = item.data;

  return (
    <span className="flex items-center gap-1">
      <span className={isRoot ? "font-medium" : ""}>{title}</span>
      <Tooltip className="max-w-md break-words" content={value || "No value"}>
        <span className={`px-1 text-xs ${value ? "text-mineshaft-400" : "text-red-400"}`}>
          <FontAwesomeIcon icon={value ? faEye : faEyeSlash} size="sm" />
        </span>
      </Tooltip>
    </span>
  );
};

const SecretTree = ({
  items,
  rootId,
  treeId,
  defaultExpandedIds = []
}: {
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
      renderItemTitle={renderItemTitle}
    >
      <Tree treeId={treeId} rootItem={rootId} />
    </UncontrolledTreeEnvironment>
  );
};

const NODE_TYPES = { secretNode: SecretNode };
const EDGE_TYPES = { secretEdge: SecretReferenceEdge };

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

  const flowData = useMemo(() => {
    if (!tree || tree.children.length === 0) return null;
    return convertDependencyTreeToFlow(tree, secretKey);
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

  if (!flowData || flowData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-4">
        <span className="text-sm text-mineshaft-400">No secrets reference this secret</span>
      </div>
    );
  }

  return (
    <div>
      <div className="h-72 w-full rounded-md border border-mineshaft-600">
        {isError ? (
          <div className="flex h-full items-center justify-center">
            <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2 text-red-500" />
            <p className="text-red-500">Error fetching secret dependency tree</p>
          </div>
        ) : (
          <ReactFlowProvider>
            <ReactFlow
              nodes={flowData.nodes}
              edges={flowData.edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              colorMode="dark"
              nodesDraggable={false}
              edgesReconnectable={false}
              nodesConnectable={false}
              connectionLineType={ConnectionLineType.SmoothStep}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              minZoom={0.1}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#5d5f64" bgColor="#111419" variant={BackgroundVariant.Dots} />
              <Controls position="bottom-left" showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
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
