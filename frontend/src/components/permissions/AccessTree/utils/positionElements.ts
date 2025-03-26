import Dagre from "@dagrejs/dagre";
import { Edge, Node } from "@xyflow/react";

export const positionElements = (nodes: Node[], edges: Edge[]) => {
  const regularNodes = nodes.filter((node) => node.type !== "showMoreButton");
  const showMoreNodes = nodes.filter((node) => node.type === "showMoreButton");

  const nodeMap: Record<string, Node> = {};
  const childrenMap: Record<string, string[]> = {};

  edges.forEach((edge) => {
    if (!childrenMap[edge.source]) {
      childrenMap[edge.source] = [];
    }
    childrenMap[edge.source].push(edge.target);
  });

  const dagre = new Dagre.graphlib.Graph({ directed: true })
    .setDefaultEdgeLabel(() => ({}))
    .setGraph({ rankdir: "TB" });

  edges.forEach((edge) => dagre.setEdge(edge.source, edge.target));

  regularNodes.forEach((node) => dagre.setNode(node.id, node));

  Dagre.layout(dagre, {});

  const positionedNodes = regularNodes.map((node) => {
    const { x, y } = dagre.node(node.id);

    const positionedNode = {
      ...node,
      position: {
        x: x - (node.width ? node.width / 2 : 0),
        y: y - (node.height ? node.height / 2 : 0)
      }
    };

    nodeMap[node.id] = positionedNode;

    return positionedNode;
  });

  const findLastChildNode = (parentId: string): Node | undefined => {
    const childrenIds = childrenMap[parentId] || [];
    if (childrenIds.length === 0) return undefined;

    const childNodes = childrenIds.map((id) => nodeMap[id]).filter(Boolean);

    if (childNodes.length === 0) return undefined;

    childNodes.sort((a, b) => {
      if (a.position.y === b.position.y) {
        return b.position.x - a.position.x;
      }
      return b.position.y - a.position.y;
    });

    return childNodes[0];
  };

  const positionedShowMoreNodes = showMoreNodes.map((node) => {
    const parentId = node.data.parentId as string;

    const parentNode = nodeMap[parentId] || positionedNodes[0];
    const lastChildNode = findLastChildNode(parentId);

    const referenceNode = lastChildNode || parentNode;

    const referenceX = referenceNode.position.x;
    const referenceY = referenceNode.position.y;

    const referenceWidth = referenceNode.width || 150;

    const buttonX = referenceX + referenceWidth - 85;
    const buttonY = referenceY - 25;

    return {
      ...node,
      position: {
        x: buttonX,
        y: buttonY
      }
    };
  });

  return {
    nodes: [...positionedNodes, ...positionedShowMoreNodes],
    edges
  };
};
