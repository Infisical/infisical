import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Edge,
  Node,
  NodeMouseHandler,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from "@xyflow/react";
import { format } from "date-fns";
import { MaximizeIcon, MinusIcon, PlusIcon } from "lucide-react";

import { IconButton } from "@app/components/v3";
import { useTheme } from "@app/components/v3/platform/ThemeProvider";

import { buildAccessGraph, TAccessGraphInput } from "./buildAccessGraph";
import { BandLabelNode, LaneEdge, ReaderNode, SecretNode } from "./nodes";

const NODE_TYPES = {
  reader: ReaderNode,
  secret: SecretNode,
  bandLabel: BandLabelNode
};

const EDGE_TYPES = { lane: LaneEdge };

const DIMMED_OPACITY = 0.2;

type Props = {
  input: TAccessGraphInput;
};

// Everything reachable from a node along its edges, both ways: a reader lights up the secret.
const connectedTo = (nodeId: string, edges: Edge[]) => {
  const reached = new Set([nodeId]);
  const walk = (from: string, direction: "source" | "target") => {
    const to = direction === "source" ? "target" : "source";
    edges.forEach((edge) => {
      if (edge[direction] === from && !reached.has(edge[to])) {
        reached.add(edge[to]);
        walk(edge[to], direction);
      }
    });
  };
  walk(nodeId, "source");
  walk(nodeId, "target");
  return reached;
};

const SecretAccessGraphContent = ({ input }: Props) => {
  const { resolvedTheme } = useTheme();
  const {
    nodes: builtNodes,
    edges: builtEdges,
    contentHeight,
    contentWidth
  } = useMemo(() => buildAccessGraph(input), [input]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(builtEdges);
  const [focusedId, setFocusedId] = useState<string>();

  useEffect(() => {
    setNodes(builtNodes);
    setEdges(builtEdges);
    setFocusedId(undefined);
  }, [builtNodes, builtEdges, setNodes, setEdges]);

  // Focus dims rather than hides, so the viewer keeps their bearings.
  const focused = useMemo(
    () => (focusedId ? connectedTo(focusedId, builtEdges) : undefined),
    [focusedId, builtEdges]
  );
  const displayedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        style: {
          ...node.style,
          opacity:
            !focused || focused.has(node.id) || node.type === "bandLabel" ? 1 : DIMMED_OPACITY
        }
      })),
    [nodes, focused]
  );
  const displayedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        style: {
          ...edge.style,
          opacity:
            !focused || (focused.has(edge.source) && focused.has(edge.target))
              ? edge.style?.opacity
              : DIMMED_OPACITY * 0.5
        }
      })),
    [edges, focused]
  );

  // Selecting a reader focuses its line; selecting it again, or anything else, clears the focus.
  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    const isFocusable = node.type === "reader";
    setFocusedId((current) => (isFocusable && current !== node.id ? node.id : undefined));
  }, []);

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
        onPaneClick={() => setFocusedId(undefined)}
        // Themes React Flow's own chrome, the attribution included, to match the app.
        colorMode={resolvedTheme}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        proOptions={{ hideAttribution: false }}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        // The canvas sits in a scrolling sheet, so the wheel belongs to the sheet. Zoom stays on the
        // controls and pinch, otherwise scrolling past the graph traps the viewer inside it.
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

// Outside the scrolling element, so the controls stay put however tall the graph gets; top right, clear of the
// readers and of the React Flow attribution in the bottom right.
const ZoomControls = () => {
  const { zoomIn, zoomOut, setViewport } = useReactFlow();
  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col overflow-hidden rounded-md border border-border bg-card">
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
        onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
      >
        <MaximizeIcon />
      </IconButton>
    </div>
  );
};

export const SecretAccessGraph = ({ input }: Props) => (
  <ReactFlowProvider>
    <div className="relative flex h-[560px] min-h-0 rounded-md border border-border">
      <div className="flex min-h-0 thin-scrollbar flex-1 overflow-auto">
        <SecretAccessGraphContent input={input} />
      </div>
      <ZoomControls />
    </div>
    <p className="text-xs text-muted">
      {input.hasReadActivity
        ? `Solid lines are reads since ${input.trackedSince ? format(new Date(input.trackedSince), "PP") : "tracking began"}, dashed lines are access with no reads yet. Select a reader to highlight their line.`
        : "Read activity is not visible for your role, so the lines only show who can read the value. Select a reader to highlight their line."}
    </p>
  </ReactFlowProvider>
);
