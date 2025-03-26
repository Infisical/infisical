import Dagre from "@dagrejs/dagre";
import { Edge, Node } from "@xyflow/react";

export const positionElements = (nodes: Node[], edges: Edge[]) => {
  const regularNodes = nodes.filter((node) => node.type !== "showMoreButton");
  const showMoreNodes = nodes.filter((node) => node.type === "showMoreButton");

  const nodeMap: Record<string, Node> = {};

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

  const positionedShowMoreNodes = showMoreNodes.map((node) => {
    const parentId = node.data.parentId as string;
    const { isStart } = node.data;

    const parentNode = nodeMap[parentId] || positionedNodes[0];
    const parentX = parentNode.position.x;
    const parentY = parentNode.position.y;

    const parentWidth = parentNode.width || 150;
    const buttonWidth = node.width || 100;

    const buttonX = isStart ? parentX - buttonWidth - 20 : parentX + parentWidth + 20;

    return {
      ...node,
      position: {
        x: buttonX,
        y: parentY
      }
    };
  });
  return {
    nodes: [...positionedNodes, ...positionedShowMoreNodes],
    edges
  };
};
