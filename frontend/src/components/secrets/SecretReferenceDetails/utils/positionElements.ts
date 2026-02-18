import Dagre from "@dagrejs/dagre";
import { Edge, Node } from "@xyflow/react";

export const positionElements = (nodes: Node[], edges: Edge[]) => {
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
      }
    };
  });

  return {
    nodes: positionedNodes,
    edges
  };
};
