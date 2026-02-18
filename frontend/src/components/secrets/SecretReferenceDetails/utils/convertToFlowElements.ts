import { Edge, MarkerType, Node } from "@xyflow/react";

import { TSecretDependencyTreeNode } from "@app/hooks/api/secrets/types";

import { positionElements } from "./positionElements";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 58;

export type SecretNodeData = {
  secretKey: string;
  environment: string;
  secretPath: string;
  isRoot: boolean;
  isCircular: boolean;
};

const makeNodeKey = (env: string, path: string, key: string) => `${env}:${path}:${key}`;

// Walk the dependency tree and produce React Flow elements with root at the top
export const convertDependencyTreeToFlow = (tree: TSecretDependencyTreeNode) => {
  const nodes: Node<SecretNodeData>[] = [];
  const edges: Edge[] = [];

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
      node.children.forEach((child) => walk(child, nodeId, depth + 1, newVisited));
    }
  };

  walk(tree, undefined, 0, new Set());

  return positionElements(nodes, edges);
};
