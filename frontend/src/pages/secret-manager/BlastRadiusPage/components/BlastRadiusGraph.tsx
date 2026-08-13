import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Edge,
  Node,
  NodeMouseHandler,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from "@xyflow/react";
import { MaximizeIcon, MinusIcon, PlusIcon } from "lucide-react";

import { IconButton } from "@app/components/v3";
import { TBlastRadius, TBlastRadiusPrincipal } from "@app/hooks/api/blastRadius";

import {
  buildBlastRadiusGraph,
  principalNodeId,
  SECRET_NODE_ID,
  TPrincipalNodeData
} from "../utils/buildGraph";
import { BandLabelNode } from "./nodes/BandLabelNode";
import { DestinationNode } from "./nodes/DestinationNode";
import { GhostNode } from "./nodes/GhostNode";
import { PrincipalNode } from "./nodes/PrincipalNode";
import { SecretNode } from "./nodes/SecretNode";

const NODE_TYPES = {
  principal: PrincipalNode,
  secret: SecretNode,
  destination: DestinationNode,
  ghost: GhostNode,
  bandLabel: BandLabelNode
};

const DIMMED_OPACITY = 0.2;

type Props = {
  blastRadius: TBlastRadius;
  hideHealthyDestinations: boolean;
  selectedPrincipalId?: string;
  popover: TPrincipalNodeData["popover"];
  onSelectPrincipal: (principal: TBlastRadiusPrincipal | undefined) => void;
};

const BlastRadiusGraphContent = ({
  blastRadius,
  hideHealthyDestinations,
  selectedPrincipalId,
  popover,
  onSelectPrincipal
}: Props) => {
  const {
    nodes: builtNodes,
    edges: builtEdges,
    contentHeight,
    contentWidth
  } = useMemo(
    () => buildBlastRadiusGraph(blastRadius, { hideHealthyDestinations, popover }),
    [blastRadius, hideHealthyDestinations, popover]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(builtEdges);

  useEffect(() => {
    setNodes(builtNodes);
    setEdges(builtEdges);
  }, [builtNodes, builtEdges, setNodes, setEdges]);

  // Focus mode dims rather than hides, so the reader keeps their bearings in the graph.
  const displayedNodes = useMemo(
    () =>
      nodes.map((node) => {
        if (!selectedPrincipalId) return { ...node, style: { ...node.style, opacity: 1 } };
        const onPath = node.id === selectedPrincipalId || node.id === SECRET_NODE_ID;
        return {
          ...node,
          selected: node.id === selectedPrincipalId,
          style: { ...node.style, opacity: onPath ? 1 : DIMMED_OPACITY }
        };
      }),
    [nodes, selectedPrincipalId]
  );

  const displayedEdges = useMemo(
    () =>
      edges.map((edge) => {
        if (!selectedPrincipalId) return edge;
        const onPath = edge.source === selectedPrincipalId || edge.target === selectedPrincipalId;
        return {
          ...edge,
          style: { ...edge.style, opacity: onPath ? 1 : DIMMED_OPACITY * 0.5 }
        };
      }),
    [edges, selectedPrincipalId]
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (node.type !== "principal") {
        onSelectPrincipal(undefined);
        return;
      }

      const match = blastRadius.principals.find(
        (principal) => principalNodeId(principal) === node.id
      );
      onSelectPrincipal(match);
    },
    [blastRadius.principals, onSelectPrincipal]
  );

  return (
    <div
      className="flex flex-1 flex-col"
      style={{ minHeight: contentHeight, minWidth: contentWidth }}
    >
      <ReactFlow
        nodes={displayedNodes}
        edges={displayedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={() => onSelectPrincipal(undefined)}
        nodeTypes={NODE_TYPES}
        connectionLineType={ConnectionLineType.SmoothStep}
        defaultEdgeOptions={{ type: "smoothstep" }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        // The canvas is embedded in a scrolling page, so the wheel belongs to the page. Zoom stays on
        // the controls and pinch, otherwise scrolling past the graph traps the reader inside it.
        zoomOnScroll={false}
        preventScrolling={false}
        minZoom={0.4}
        maxZoom={1.6}
        className="h-full flex-1 bg-background"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="var(--color-border)"
        />
      </ReactFlow>
    </div>
  );
};

/**
 * React Flow's own `<Controls>` is positioned against the canvas, which is sized to the content, so once
 * the content outgrew the viewport the controls sat below the fold and scrolled away with it. These live
 * outside the scrolling element instead, so they stay put however tall the graph gets.
 */
const ZoomControls = () => {
  const { zoomIn, zoomOut, setViewport } = useReactFlow();

  return (
    <div className="absolute right-3 bottom-3 z-10 flex flex-col overflow-hidden rounded-md border border-border bg-card">
      <IconButton variant="ghost" size="xs" aria-label="Zoom in" onClick={() => zoomIn()}>
        <PlusIcon />
      </IconButton>
      <IconButton variant="ghost" size="xs" aria-label="Zoom out" onClick={() => zoomOut()}>
        <MinusIcon />
      </IconButton>
      <IconButton
        variant="ghost"
        size="xs"
        aria-label="Reset zoom"
        // Back to 1:1 at the origin rather than `fitView`, which is the thing this layout exists to avoid.
        onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
      >
        <MaximizeIcon />
      </IconButton>
    </div>
  );
};

export const BlastRadiusGraph = (props: Props) => (
  <ReactFlowProvider>
    <div className="relative flex min-h-0 flex-1">
      <div className="flex min-h-0 flex-1 overflow-auto">
        <BlastRadiusGraphContent {...props} />
      </div>
      <ZoomControls />
    </div>
  </ReactFlowProvider>
);
