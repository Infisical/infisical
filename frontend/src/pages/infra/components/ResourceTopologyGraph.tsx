import { useEffect, useMemo, useRef, useState } from "react";
import Dagre from "@dagrejs/dagre";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  type Edge,
  MarkerType,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow
} from "@xyflow/react";
import { twMerge } from "tailwind-merge";

import "@xyflow/react/dist/style.css";

import { ResourceNode, type ResourceNodeData } from "./ResourceNode";

// ── Types ──

type GraphNode = { id: string; type: string; name: string; provider: string };
type GraphEdge = { source: string; target: string };

type ResourceTopologyGraphProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  actionMap?: Record<string, string>; // address → action
  compact?: boolean;
  className?: string;
  animate?: boolean; // enable staggered entrance animation
};

// ── Layout helpers ──

const NODE_WIDTH_NORMAL = 200;
const NODE_HEIGHT_NORMAL = 52;
const NODE_WIDTH_COMPACT = 150;
const NODE_HEIGHT_COMPACT = 40;

/** Dagre layout — structured tree */
const dagreLayout = (flowNodes: Node<ResourceNodeData>[], flowEdges: Edge[], compact: boolean) => {
  const w = compact ? NODE_WIDTH_COMPACT : NODE_WIDTH_NORMAL;
  const h = compact ? NODE_HEIGHT_COMPACT : NODE_HEIGHT_NORMAL;
  const gapX = compact ? w + 30 : w + 50;
  const gapY = compact ? h + 40 : h + 60;

  const connectedIds = new Set<string>();
  flowEdges.forEach((edge) => {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  });

  const connectedNodes = flowNodes.filter((n) => connectedIds.has(n.id));
  const isolatedNodes = flowNodes.filter((n) => !connectedIds.has(n.id));

  let maxY = 0;
  const positionMap = new Map<string, { x: number; y: number }>();

  if (connectedNodes.length > 0) {
    const dagre = new Dagre.graphlib.Graph({ directed: true })
      .setDefaultEdgeLabel(() => ({}))
      .setGraph({
        rankdir: "TB",
        nodesep: compact ? 40 : 60,
        ranksep: compact ? 50 : 80
      });

    connectedNodes.forEach((node) => dagre.setNode(node.id, { width: w, height: h }));
    flowEdges.forEach((edge) => dagre.setEdge(edge.source, edge.target));
    Dagre.layout(dagre);

    connectedNodes.forEach((node) => {
      const { x, y } = dagre.node(node.id);
      const pos = { x: x - w / 2, y: y - h / 2 };
      positionMap.set(node.id, pos);
      maxY = Math.max(maxY, pos.y + h);
    });
  }

  if (isolatedNodes.length > 0) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(isolatedNodes.length)));
    const startY = connectedNodes.length > 0 ? maxY + gapY : 0;

    isolatedNodes.forEach((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positionMap.set(node.id, { x: col * gapX, y: startY + row * gapY });
    });
  }

  return {
    nodes: flowNodes.map((node) => ({
      ...node,
      position: positionMap.get(node.id) ?? { x: 0, y: 0 }
    })),
    edges: flowEdges
  };
};

// ── Node types ──

const NODE_TYPES = { resourceNode: ResourceNode };

// ── Edge color helpers ──

const ACTION_EDGE_COLORS: Record<string, string> = {
  create: "#22c55e",
  update: "#eab308",
  replace: "#eab308",
  delete: "#ef4444"
};

const DEFAULT_EDGE_COLOR = "#5d5f64";

// ── Easing ──

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

// ── Animated inner graph (dagre layout with lerp entrance) ──

const AnimatedInnerGraph = ({
  nodes: inputNodes,
  edges: inputEdges,
  actionMap,
  compact = false,
  className
}: ResourceTopologyGraphProps) => {
  const { fitView } = useReactFlow();
  const cancelRef = useRef<(() => void) | null>(null);
  const hasAnimatedRef = useRef(false);

  // Compute dagre layout
  const { layoutNodes, layoutEdges, centerX, centerY } = useMemo(() => {
    const w = compact ? NODE_WIDTH_COMPACT : NODE_WIDTH_NORMAL;
    const h = compact ? NODE_HEIGHT_COMPACT : NODE_HEIGHT_NORMAL;

    const fNodes: Node<ResourceNodeData>[] = inputNodes.map((n) => ({
      id: n.id,
      type: "resourceNode",
      position: { x: 0, y: 0 },
      width: w,
      height: h,
      data: {
        resourceType: n.type,
        resourceName: n.name,
        action: actionMap?.[n.id],
        compact
      }
    }));

    const fEdges: Edge[] = inputEdges.map((e) => {
      const targetAction = actionMap?.[e.target];
      const edgeColor = (targetAction && ACTION_EDGE_COLORS[targetAction]) || DEFAULT_EDGE_COLOR;
      return {
        id: `e-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        type: "default",
        animated: Boolean(targetAction),
        markerEnd: { type: MarkerType.ArrowClosed as const, color: edgeColor, width: 16, height: 16 },
        style: { stroke: edgeColor, strokeWidth: 1.5 }
      };
    });

    const layout = dagreLayout(fNodes, fEdges, compact);

    let cx = 0;
    let cy = 0;
    if (layout.nodes.length > 0) {
      for (const n of layout.nodes) {
        cx += n.position.x;
        cy += n.position.y;
      }
      cx /= layout.nodes.length;
      cy /= layout.nodes.length;
    }

    return { layoutNodes: layout.nodes, layoutEdges: layout.edges, centerX: cx, centerY: cy };
  }, [inputNodes, inputEdges, actionMap, compact]);

  // State for animated positions — start at final positions (safe default)
  const [flowNodes, setFlowNodes] = useState<Node<ResourceNodeData>[]>(layoutNodes);
  const [flowEdges, setFlowEdges] = useState<Edge[]>(layoutEdges);

  // When layout changes, animate from center to final positions
  useEffect(() => {
    if (layoutNodes.length === 0) {
      setFlowNodes([]);
      setFlowEdges([]);
      return;
    }

    // If we already animated once (same component instance), just snap to new positions
    if (hasAnimatedRef.current) {
      setFlowNodes(layoutNodes);
      setFlowEdges(layoutEdges);
      return;
    }

    hasAnimatedRef.current = true;

    if (cancelRef.current) cancelRef.current();

    // Show edges immediately
    setFlowEdges(layoutEdges);

    // Build target map
    const targets = new Map<string, { x: number; y: number }>();
    for (const n of layoutNodes) targets.set(n.id, n.position);

    const totalFrames = 40;
    let frame = 0;
    let cancelled = false;
    let rafId: number;

    const tick = () => {
      if (cancelled) return;
      frame += 1;
      const t = easeOutCubic(Math.min(frame / totalFrames, 1));

      setFlowNodes(
        layoutNodes.map((n) => {
          const target = targets.get(n.id)!;
          return {
            ...n,
            position: {
              x: centerX + (target.x - centerX) * t,
              y: centerY + (target.y - centerY) * t
            }
          };
        })
      );

      if (frame >= totalFrames) {
        setFlowNodes(layoutNodes);
        setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 50);
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    cancelRef.current = () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };

    return () => {
      if (cancelRef.current) cancelRef.current();
    };
  }, [layoutNodes, layoutEdges, centerX, centerY, fitView]);

  if (inputNodes.length === 0) {
    return (
      <div
        className={twMerge(
          "flex items-center justify-center text-sm text-mineshaft-500",
          className
        )}
      >
        No resources to display
      </div>
    );
  }

  return (
    <div
      className={twMerge(
        "w-full overflow-hidden rounded-lg border border-mineshaft-600",
        className
      )}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        colorMode="dark"
        nodesDraggable
        edgesReconnectable={false}
        nodesConnectable={false}
        connectionLineType={ConnectionLineType.Bezier}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#5d5f64" bgColor="#111419" variant={BackgroundVariant.Dots} />
        {!compact && <Controls position="bottom-left" showInteractive={false} />}
      </ReactFlow>
    </div>
  );
};

// ── Static inner graph (dagre, no animation) ──

const StaticInnerGraph = ({
  nodes: inputNodes,
  edges: inputEdges,
  actionMap,
  compact = false,
  className
}: ResourceTopologyGraphProps) => {
  const { nodes, edges } = useMemo(() => {
    const w = compact ? NODE_WIDTH_COMPACT : NODE_WIDTH_NORMAL;
    const h = compact ? NODE_HEIGHT_COMPACT : NODE_HEIGHT_NORMAL;

    const flowNodes: Node<ResourceNodeData>[] = inputNodes.map((n) => ({
      id: n.id,
      type: "resourceNode",
      position: { x: 0, y: 0 },
      width: w,
      height: h,
      data: {
        resourceType: n.type,
        resourceName: n.name,
        action: actionMap?.[n.id],
        compact
      }
    }));

    const flowEdges: Edge[] = inputEdges.map((e) => {
      const targetAction = actionMap?.[e.target];
      const edgeColor = (targetAction && ACTION_EDGE_COLORS[targetAction]) || DEFAULT_EDGE_COLOR;
      return {
        id: `e-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        type: "default",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor, width: 16, height: 16 },
        style: { stroke: edgeColor, strokeWidth: 1.5 }
      };
    });

    return dagreLayout(flowNodes, flowEdges, compact);
  }, [inputNodes, inputEdges, actionMap, compact]);

  if (inputNodes.length === 0) {
    return (
      <div
        className={twMerge(
          "flex items-center justify-center text-sm text-mineshaft-500",
          className
        )}
      >
        No resources to display
      </div>
    );
  }

  return (
    <div
      className={twMerge(
        "w-full overflow-hidden rounded-lg border border-mineshaft-600",
        className
      )}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        colorMode="dark"
        nodesDraggable={false}
        edgesReconnectable={false}
        nodesConnectable={false}
        connectionLineType={ConnectionLineType.Bezier}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#5d5f64" bgColor="#111419" variant={BackgroundVariant.Dots} />
        {!compact && <Controls position="bottom-left" showInteractive={false} />}
      </ReactFlow>
    </div>
  );
};

// ── Public component ──

export const ResourceTopologyGraph = (props: ResourceTopologyGraphProps) => (
  <ReactFlowProvider>
    {props.animate ? <AnimatedInnerGraph {...props} /> : <StaticInnerGraph {...props} />}
  </ReactFlowProvider>
);
