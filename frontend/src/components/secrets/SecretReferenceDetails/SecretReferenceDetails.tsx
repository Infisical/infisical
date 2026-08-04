import { useCallback, useEffect, useMemo } from "react";
import {
  StaticTreeDataProvider,
  Tree,
  TreeItem,
  TreeItemIndex,
  UncontrolledTreeEnvironment
} from "react-complex-tree";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  ReactFlow,
  ReactFlowProvider
} from "@xyflow/react";
import { AxiosError } from "axios";
import {
  CircleHelpIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  TriangleAlertIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Field,
  FieldContent,
  FieldLabel,
  SecretInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useProject } from "@app/context";
import { useGetSecretReferences, useGetSecretReferenceTree } from "@app/hooks/api";
import { ApiErrorTypes, TApiErrors, TSecretReferenceTraceNode } from "@app/hooks/api/types";

import { SecretReferenceEdge } from "./edges/SecretReferenceEdge";
import { ProjectGroupNode } from "./nodes/ProjectGroupNode";
import { SecretNode } from "./nodes/SecretNode";
import { convertDependencyTreeToFlow } from "./utils/convertToFlowElements";
import { SecretReferenceCloseContext } from "./SecretReferenceContext";

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
  environment?: string;
  secretPath?: string;
  secretKey?: string;
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
      isRoot: !parentId,
      environment: node.environment,
      secretPath: node.secretPath,
      secretKey: node.key
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

const SecretTree = ({
  items,
  rootId,
  treeId,
  defaultExpandedIds = [],
  onSecretClick
}: {
  items: Record<TreeItemIndex, TreeItem<TreeNodeData>>;
  rootId: string;
  treeId: string;
  defaultExpandedIds?: string[];
  onSecretClick?: (env: string, path: string, key: string) => void;
}) => {
  const renderItemTitle = ({ item }: { item: TreeItem<TreeNodeData> }) => {
    const { title, value, isRoot, environment, secretPath, secretKey } = item.data;
    const isClickable = !isRoot && onSecretClick && environment && secretPath && secretKey;

    return (
      <span className="flex items-center gap-1">
        {isClickable ? (
          <button
            type="button"
            className={`${isRoot ? "font-medium" : ""} cursor-pointer hover:underline`}
            onClick={() => onSecretClick(environment, secretPath, secretKey)}
          >
            {title}
          </button>
        ) : (
          <span className={isRoot ? "font-medium" : ""}>{title}</span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`px-1 text-xs ${value ? "text-muted" : "text-danger"}`}>
              {value ? <EyeIcon className="size-3.5" /> : <EyeOffIcon className="size-3.5" />}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-md break-words">{value || "No value"}</TooltipContent>
        </Tooltip>
      </span>
    );
  };

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

const NODE_TYPES = { secretNode: SecretNode, projectGroupNode: ProjectGroupNode };
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
    return convertDependencyTreeToFlow(tree);
  }, [tree]);

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
        <Loader2Icon className="size-5 animate-spin text-muted" />
      </div>
    );
  }

  if (!flowData || flowData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-4">
        <span className="text-sm text-muted">No secrets reference this secret</span>
      </div>
    );
  }

  return (
    <div>
      <div className="h-72 w-full rounded-md border border-border">
        {isError ? (
          <div className="flex h-full items-center justify-center">
            <TriangleAlertIcon className="mr-2 size-4 text-danger" />
            <p className="text-danger">Error fetching secret dependency tree</p>
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
              proOptions={{ hideAttribution: false }}
            >
              <Background color="#5d5f64" bgColor="#111419" variant={BackgroundVariant.Dots} />
              <Controls position="bottom-left" showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        )}
      </div>
      <div className="mt-2 text-xs text-muted">
        Shows secrets that depend on this secret. Each level is referenced by the one above it.
      </div>
    </div>
  );
};

export const SecretReferenceTree = ({
  secretPath,
  environment,
  secretKey,
  onClose
}: Props & { onClose?: () => void }) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";
  const navigate = useNavigate();
  const routeParams = useParams({ strict: false });

  const handleSecretClick = useCallback(
    (env: string, path: string, key: string) => {
      onClose?.();
      navigate({
        to: ROUTE_PATHS.SecretManager.OverviewPage.path,
        params: {
          orgId: routeParams.orgId as string,
          projectId: currentProject?.id || ""
        },
        search: {
          secretPath: path || "/",
          search: key || "",
          environments: [env]
        }
      });
    },
    [navigate, routeParams.orgId, currentProject, onClose]
  );

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
        <Loader2Icon className="size-5 animate-spin text-muted" />
      </div>
    );
  }

  const hasReferences = tree && tree.children?.length > 0;

  return (
    <SecretReferenceCloseContext.Provider value={onClose}>
      <div>
        <Field>
          <div className="mb-1 flex items-center gap-1.5">
            <FieldLabel>Expanded value</FieldLabel>
            {hasCirculars && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="More information"
                    className="rounded-sm text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <CircleHelpIcon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-md break-words">
                  This secret contains circular references. Value shown is resolved once, with
                  circular paths truncated in the reference tree below.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <FieldContent>
            <SecretInput
              key="value-overriden"
              isReadOnly
              value={secretValue}
              containerClassName="text-label hover:border-primary-400/50 border border-border bg-container px-2 py-1.5"
            />
          </FieldContent>
        </Field>

        <div className="mb-2 flex items-center gap-1.5">
          <FieldLabel>Reference Tree</FieldLabel>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="More information"
                className="rounded-sm text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CircleHelpIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-md break-words">
              Overview of all secrets across your project that this secret references. Note that you
              are only able to view the references that you have access to.
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="secret-tree-container relative max-h-96 thin-scrollbar overflow-auto rounded-md border border-border bg-container p-3 text-sm text-foreground">
          {isError && (
            <div className="flex items-center justify-center py-4">
              <TriangleAlertIcon className="mr-2 size-4 text-danger" />
              <p className="text-danger">Error fetching secret reference tree</p>
            </div>
          )}
          {!isError && hasReferences && treeItems.rootId && (
            <SecretTree
              items={treeItems.items}
              rootId={treeItems.rootId}
              treeId="reference-tree"
              defaultExpandedIds={[treeItems.expandId]}
              onSecretClick={handleSecretClick}
            />
          )}
          {!isError && !hasReferences && (
            <div className="flex items-center justify-center py-4">
              <span className="text-muted">This secret does not contain references</span>
            </div>
          )}
        </div>
        <div className="mt-2 text-xs text-muted">
          Click a secret key to navigate to it (expand/collapse with the arrow).
        </div>

        <div className="mt-6 mb-2 flex items-center gap-1.5">
          <FieldLabel>Dependency Tree</FieldLabel>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="More information"
                className="rounded-sm text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CircleHelpIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-md break-words">
              Overview of all secrets across your project that this secret is referenced by. Note
              that you are only able to view the references that you have access to.
            </TooltipContent>
          </Tooltip>
        </div>
        <SecretDependencyTree
          secretPath={secretPath}
          environment={environment}
          secretKey={secretKey}
        />
      </div>
    </SecretReferenceCloseContext.Provider>
  );
};
