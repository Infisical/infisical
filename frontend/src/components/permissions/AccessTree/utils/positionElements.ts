import Dagre from "@dagrejs/dagre";
import { Edge, Node } from "@xyflow/react";

export const positionElements = (nodes: Node[], edges: Edge[]) => {
  const showMoreNodes = nodes.filter((node) => node.type === "showMoreButton");
  const showMoreParentIds = new Set(
    showMoreNodes.map((node) => node.data.parentId).filter(Boolean)
  );

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
    .setGraph({
      rankdir: "TB",
      nodesep: 50,
      ranksep: 70
    });

  nodes.forEach((node) => {
    dagre.setNode(node.id, {
      width: node.width || 150,
      height: node.height || 40
    });
  });

  edges.forEach((edge) => dagre.setEdge(edge.source, edge.target));

  Dagre.layout(dagre, {});

  const positionedNodes = nodes.map((node) => {
    const { x, y } = dagre.node(node.id);

    return {
      ...node,
      position: {
        x: x - (node.width ? node.width / 2 : 0),
        y: y - (node.height ? node.height / 2 : 0)
      },
      style: node.type === "showMoreButton" ? { ...node.style, zIndex: 10 } : node.style
    };
  });

  positionedNodes.forEach((node) => {
    nodeMap[node.id] = node;
  });

  Array.from(showMoreParentIds).forEach((parentId) => {
    const showMoreNodeIndex = positionedNodes.findIndex(
      (node) => node.type === "showMoreButton" && node.data.parentId === parentId
    );

    if (showMoreNodeIndex !== -1) {
      const siblings = positionedNodes.filter(
        (node) => node.data?.parentId === parentId && node.type !== "showMoreButton"
      );

      if (siblings.length > 0) {
        const rightmostSibling = siblings.reduce(
          (rightmost, current) => (current.position.x > rightmost.position.x ? current : rightmost),
          siblings[0]
        );

        positionedNodes[showMoreNodeIndex] = {
          ...positionedNodes[showMoreNodeIndex],
          position: {
            x: rightmostSibling.position.x + (rightmostSibling.width || 150) + 30,
            y: rightmostSibling.position.y
          }
        };
      }
    }
  });

  return {
    nodes: positionedNodes,
    edges
  };
};
