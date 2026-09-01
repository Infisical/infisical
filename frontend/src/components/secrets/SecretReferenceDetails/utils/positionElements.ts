import Dagre from "@dagrejs/dagre";
import { Edge, Node } from "@xyflow/react";

import { ProjectGroupNodeData } from "../nodes/ProjectGroupNode";

type GroupInfo = {
  groupId: string;
  projectName: string;
  childNodeIds: string[];
};

const GROUP_PADDING = 12;
const GROUP_HEADER_HEIGHT = 24;

export const positionElements = (nodes: Node[], edges: Edge[], groups: GroupInfo[] = []) => {
  const dagre = new Dagre.graphlib.Graph({ directed: true, compound: true })
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

  groups.forEach((group) => {
    dagre.setNode(group.groupId, {});
    group.childNodeIds.forEach((childId) => {
      dagre.setParent(childId, group.groupId);
    });
  });

  edges.forEach((edge) => dagre.setEdge(edge.source, edge.target));

  Dagre.layout(dagre, {});

  const positionedNodes: Node[] = nodes.map((node) => {
    const { x, y } = dagre.node(node.id);

    return {
      ...node,
      position: {
        x: x - (node.width ? node.width / 2 : 0),
        y: y - (node.height ? node.height / 2 : 0)
      }
    };
  });

  const groupNodes: Node<ProjectGroupNodeData>[] = groups
    .map((group) => {
      const childPositions = group.childNodeIds
        .map((id) => positionedNodes.find((n) => n.id === id))
        .filter(Boolean) as Node[];

      if (childPositions.length === 0) return null;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      childPositions.forEach((child) => {
        const w = child.width || 150;
        const h = child.height || 40;
        minX = Math.min(minX, child.position.x);
        minY = Math.min(minY, child.position.y);
        maxX = Math.max(maxX, child.position.x + w);
        maxY = Math.max(maxY, child.position.y + h);
      });

      const groupX = minX - GROUP_PADDING;
      const groupY = minY - GROUP_PADDING - GROUP_HEADER_HEIGHT;
      const groupWidth = maxX - minX + GROUP_PADDING * 2;
      const groupHeight = maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER_HEIGHT;

      return {
        id: group.groupId,
        type: "projectGroupNode",
        position: { x: groupX, y: groupY },
        width: groupWidth,
        height: groupHeight,
        style: { width: groupWidth, height: groupHeight },
        zIndex: -1,
        data: { projectName: group.projectName },
        selectable: false,
        draggable: false
      };
    })
    .filter(Boolean) as Node<ProjectGroupNodeData>[];

  return {
    nodes: [...groupNodes, ...positionedNodes],
    edges
  };
};
