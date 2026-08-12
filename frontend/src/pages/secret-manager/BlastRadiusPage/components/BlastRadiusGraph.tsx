import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  Edge,
  Node,
  NodeMouseHandler,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from "@xyflow/react";

import { TBlastRadius, TBlastRadiusPrincipal } from "@app/hooks/api/blastRadius";

import {
  buildBlastRadiusGraph,
  CLUSTER_NODE_ID,
  principalNodeId,
  SECRET_NODE_ID
} from "../utils/buildGraph";
import { ClusterNode } from "./nodes/ClusterNode";
import { DestinationNode } from "./nodes/DestinationNode";
import { GhostReaderNode } from "./nodes/GhostReaderNode";
import { PrincipalNode } from "./nodes/PrincipalNode";
import { SecretNode } from "./nodes/SecretNode";

const NODE_TYPES = {
  principal: PrincipalNode,
  secret: SecretNode,
  destination: DestinationNode,
  ghost: GhostReaderNode,
  cluster: ClusterNode
};

const DIMMED_OPACITY = 0.2;

type Props = {
  blastRadius: TBlastRadius;
  isCheckingActivity: boolean;
  clusterUnusedAccess: boolean;
  hideHealthyDestinations: boolean;
  selectedPrincipalId?: string;
  onSelectPrincipal: (principal: TBlastRadiusPrincipal | undefined) => void;
  onExpandCluster: () => void;
};

const BlastRadiusGraphContent = ({
  blastRadius,
  isCheckingActivity,
  clusterUnusedAccess,
  hideHealthyDestinations,
  selectedPrincipalId,
  onSelectPrincipal,
  onExpandCluster
}: Props) => {
  const { fitView } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { nodes: builtNodes, edges: builtEdges } = useMemo(
    () => buildBlastRadiusGraph(blastRadius, { clusterUnusedAccess, hideHealthyDestinations }),
    [blastRadius, clusterUnusedAccess, hideHealthyDestinations]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(builtEdges);

  useEffect(() => {
    setNodes(builtNodes);
    setEdges(builtEdges);
  }, [builtNodes, builtEdges, setNodes, setEdges]);

  // Frame the three bands only. Ghost readers hang below the entitled column with no edges, so including
  // them in the fit would zoom every other node down to accommodate a band that is already counted in
  // the header. They stay one pan away rather than shrinking everything else.
  const framedNodes = useMemo(
    () => nodes.filter((node) => node.type !== "ghost").map((node) => ({ id: node.id })),
    [nodes]
  );

  // Refit whenever the canvas is resized, not only once on mount. A one-shot fit locks in whatever
  // height the container happened to have before layout settled, which leaves the top row clipped for
  // the rest of the session.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !framedNodes.length) return undefined;

    const refit = () =>
      fitView({
        padding: 0.16,
        duration: 200,
        minZoom: 0.55,
        maxZoom: 1,
        nodes: framedNodes
      })?.catch(() => {});

    const timeout = setTimeout(refit, 60);
    const observer = new ResizeObserver(refit);
    observer.observe(wrapper);

    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, [framedNodes, fitView]);

  // Focus mode dims rather than hides, so the reader keeps their bearings in the graph.
  const focusedNodeId = selectedPrincipalId
    ? nodes.find((node) => node.id === selectedPrincipalId)?.id
    : undefined;

  const displayedNodes = useMemo(
    () =>
      nodes.map((node) => {
        if (!focusedNodeId) return { ...node, style: { ...node.style, opacity: 1 } };
        const onPath = node.id === focusedNodeId || node.id === SECRET_NODE_ID;
        return {
          ...node,
          selected: node.id === focusedNodeId,
          style: { ...node.style, opacity: onPath ? 1 : DIMMED_OPACITY }
        };
      }),
    [nodes, focusedNodeId]
  );

  const displayedEdges = useMemo(
    () =>
      edges.map((edge) => {
        if (!focusedNodeId) return edge;
        const onPath = edge.source === focusedNodeId || edge.target === focusedNodeId;
        return {
          ...edge,
          style: { ...edge.style, opacity: onPath ? 1 : DIMMED_OPACITY * 0.5 }
        };
      }),
    [edges, focusedNodeId]
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      // A cluster expands in place rather than opening a panel: it is a fold in the canvas, not an entity.
      if (node.id === CLUSTER_NODE_ID) {
        onExpandCluster();
        return;
      }

      if (node.type !== "principal") {
        onSelectPrincipal(undefined);
        return;
      }

      const match = blastRadius.principals.find(
        (principal) => principalNodeId(principal) === node.id
      );
      onSelectPrincipal(match);
    },
    [blastRadius.principals, onSelectPrincipal, onExpandCluster]
  );

  return (
    <>
      <div ref={wrapperRef} className="flex min-h-0 flex-1 flex-col">
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
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border bg-container px-4 py-2 text-xs text-accent">
        <div className="flex items-center gap-2">
          <span className="h-0 w-6 border-t-2 border-danger" />
          observed, read in the last {blastRadius.window.effectiveDays}d
        </div>
        <div className="flex items-center gap-2">
          <span className="h-0 w-6 border-t border-dashed border-neutral" />
          {blastRadius.window.consumptionAvailable
            ? `entitled, no reads in ${blastRadius.window.effectiveDays}d`
            : "entitled, activity hidden for your role"}
        </div>
        <div className="flex items-center gap-2">
          <span className="h-0 w-6 border-t-2 border-dashed border-warning" />
          failing or manual destination
        </div>
        {Boolean(blastRadius.ghostReaders.length) && (
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full border border-dashed border-warning bg-warning/20" />
            ghost reader, read it in the window with no access today
          </div>
        )}
        <p className="ml-auto text-muted">
          usage window {blastRadius.window.effectiveDays}d
          {blastRadius.window.boundByRetention ? " (capped by plan retention)" : ""} · retention
          varies by plan
          {isCheckingActivity ? " · checking activity" : ""}
        </p>
      </div>
    </>
  );
};

export const BlastRadiusGraph = (props: Props) => (
  <ReactFlowProvider>
    <BlastRadiusGraphContent {...props} />
  </ReactFlowProvider>
);
