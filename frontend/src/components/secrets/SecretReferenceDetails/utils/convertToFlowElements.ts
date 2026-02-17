import { Edge, MarkerType, Node } from "@xyflow/react";

import { TSecretDependencyTreeNode } from "@app/hooks/api/secrets/types";

import { positionElements } from "./positionElements";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 58;

type SecretNodeData = {
  secretKey: string;
  environment: string;
  secretPath: string;
  isRoot: boolean;
  isCircular: boolean;
};

const makeNodeKey = (env: string, path: string, key: string) => `${env}:${path}:${key}`;

// Invert dependency tree so leaf nodes become roots
const invertDependencyTree = (tree: TSecretDependencyTreeNode): TSecretDependencyTreeNode[] => {
  const paths: TSecretDependencyTreeNode[][] = [];

  const collectPaths = (
    node: TSecretDependencyTreeNode,
    currentPath: TSecretDependencyTreeNode[],
    visited: Set<string>
  ) => {
    const nodeKey = makeNodeKey(node.environment, node.secretPath, node.key);

    if (visited.has(nodeKey)) {
      if (currentPath.length > 0) {
        paths.push([...currentPath, node]);
      }
      return;
    }

    const newPath = [...currentPath, node];
    const newVisited = new Set([...visited, nodeKey]);

    if (node.children.length === 0) {
      paths.push(newPath);
    } else {
      node.children.forEach((child) => collectPaths(child, newPath, newVisited));
    }
  };

  collectPaths(tree, [], new Set());

  if (paths.length === 0) return [];

  const invertedRoots: Map<string, TSecretDependencyTreeNode> = new Map();

  paths.forEach((path) => {
    const reversed = [...path].reverse();
    let currentNode: TSecretDependencyTreeNode | null = null;

    reversed.forEach((node, idx) => {
      const nodeKey = makeNodeKey(node.environment, node.secretPath, node.key);

      if (idx === 0) {
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

// Walk the dependency tree (incoming references) and produce React Flow elements
export const convertDependencyTreeToFlow = (
  tree: TSecretDependencyTreeNode,
  rootSecretKey: string
) => {
  const invertedRoots = invertDependencyTree(tree);

  if (invertedRoots.length === 0) {
    return { nodes: [], edges: [] };
  }

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
    const isOriginalRoot = node.key === rootSecretKey && depth > 0;

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
        isRoot: isOriginalRoot,
        isCircular
      }
    });

    if (parentId) {
      edges.push({
        id: `e-${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: "secretEdge",
        markerEnd: { type: MarkerType.Arrow, color: isCircular ? "#ef4444" : "#707174" },
        data: { isCircular }
      });
    }

    if (!isCircular) {
      const newVisited = new Set([...visited, nodeKey]);
      node.children.forEach((child) => walk(child, nodeId, depth + 1, newVisited));
    }
  };

  invertedRoots.forEach((root) => walk(root, undefined, 0, new Set()));

  return positionElements(nodes, edges);
};
