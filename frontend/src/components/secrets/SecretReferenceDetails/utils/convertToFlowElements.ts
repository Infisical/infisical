import { Edge, MarkerType, Node } from "@xyflow/react";

import { TSecretDependencyTreeNode } from "@app/hooks/api/secrets/types";

import { ProjectGroupNodeData } from "../nodes/ProjectGroupNode";
import { positionElements } from "./positionElements";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 58;

export type SecretNodeData = {
  secretKey: string;
  environment: string;
  secretPath: string;
  projectId?: string;
  isRoot: boolean;
  isCircular: boolean;
};

const makeNodeKey = (env: string, path: string, key: string) => `${env}:${path}:${key}`;

type GroupInfo = {
  groupId: string;
  projectName: string;
  childNodeIds: string[];
};

export const convertDependencyTreeToFlow = (tree: TSecretDependencyTreeNode) => {
  const nodes: Node<SecretNodeData | ProjectGroupNodeData>[] = [];
  const edges: Edge[] = [];
  const groups: GroupInfo[] = [];

  const walk = (
    node: TSecretDependencyTreeNode,
    parentId: string | undefined,
    depth: number,
    visited: Set<string>
  ) => {
    const nodeKey = makeNodeKey(node.environment, node.secretPath, node.key);
    const isCircular = visited.has(nodeKey);
    const nodeId = parentId ? `${parentId}>${nodeKey}` : nodeKey;
    const isRoot = depth === 0;

    nodes.push({
      id: nodeId,
      type: "secretNode",
      position: { x: 0, y: 0 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      data: {
        secretKey: node.key,
        environment: node.environment,
        secretPath: node.secretPath,
        projectId: node.project?.id,
        isRoot,
        isCircular
      }
    });

    if (parentId) {
      edges.push({
        id: `e-${nodeId}-${parentId}`,
        source: nodeId,
        target: parentId,
        type: "secretEdge",
        markerEnd: {
          type: MarkerType.Arrow,
          color: isCircular ? "#ef4444" : "#707174",
          width: 20,
          height: 20
        },
        data: { isCircular }
      });
    }

    if (!isCircular) {
      const newVisited = new Set([...visited, nodeKey]);

      const crossProjectBySlug = new Map<string, TSecretDependencyTreeNode[]>();
      const sameProjectChildren: TSecretDependencyTreeNode[] = [];

      node.children.forEach((child) => {
        if (child.project) {
          const existing = crossProjectBySlug.get(child.project.slug) || [];
          existing.push(child);
          crossProjectBySlug.set(child.project.slug, existing);
        } else {
          sameProjectChildren.push(child);
        }
      });

      sameProjectChildren.forEach((child) => walk(child, nodeId, depth + 1, newVisited));

      Array.from(crossProjectBySlug.entries()).forEach(([slug, children]) => {
        const groupId = `group-${nodeId}-${slug}`;
        const childNodeIds = children.map((child) => {
          walk(child, nodeId, depth + 1, newVisited);
          const childKey = makeNodeKey(child.environment, child.secretPath, child.key);
          return `${nodeId}>${childKey}`;
        });

        groups.push({
          groupId,
          projectName: children[0].project?.name || slug,
          childNodeIds
        });
      });
    }
  };

  walk(tree, undefined, 0, new Set());

  return positionElements(nodes, edges, groups);
};
