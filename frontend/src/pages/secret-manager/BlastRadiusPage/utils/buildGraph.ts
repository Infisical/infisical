import { Edge, MarkerType, Node } from "@xyflow/react";

import {
  DestinationStatus,
  PrincipalType,
  SecretActionName,
  TBlastRadius,
  TBlastRadiusConsumer,
  TBlastRadiusDestination,
  TBlastRadiusPrincipal
} from "@app/hooks/api/blastRadius";

// Sized for v3 badges, which carry the standard text-xs and are never shrunk: a node has to fit a
// title row, a badge row, an activity line, and a client row without clipping.
export const NODE_WIDTH = 252;
export const PRINCIPAL_NODE_HEIGHT = 122;
export const GHOST_NODE_HEIGHT = 112;
export const SECRET_NODE_HEIGHT = 148;
export const DESTINATION_NODE_HEIGHT = 100;

const COLUMN_GAP = 200;
const ROW_GAP = 18;
const GHOST_BAND_GAP = 72;
const SECRET_COLUMN_X = NODE_WIDTH + COLUMN_GAP;
const DESTINATION_COLUMN_X = SECRET_COLUMN_X * 2;

export type TPrincipalNodeData = {
  principal: TBlastRadiusPrincipal;
  windowDays: number;
  consumptionAvailable: boolean;
};

export type TSecretNodeData = {
  secret: TBlastRadius["secret"];
  consumptionAvailable: boolean;
};

export type TDestinationNodeData = {
  destination: TBlastRadiusDestination;
};

export type TGhostNodeData = {
  ghost: TBlastRadiusConsumer;
};

export type TClusterNodeData = {
  label: string;
  detail: string;
  count: number;
  principals: TBlastRadiusPrincipal[];
};

export const SECRET_NODE_ID = "secret";
export const CLUSTER_NODE_ID = "cluster-unused";

// Below this a cluster hides more than it helps: five nodes read fine, and collapsing them costs the
// reader a click for nothing.
const MIN_CLUSTERABLE = 4;

const stackColumn = (count: number, height: number, gap = ROW_GAP) => {
  const total = count * height + Math.max(0, count - 1) * gap;
  return (index: number) => index * (height + gap) - total / 2;
};

const hasObservedReads = (principal: TBlastRadiusPrincipal) =>
  (principal.observed?.readCount ?? 0) > 0;

// Read volume spans orders of magnitude, so thickness is stepped rather than proportional: three
// legible steps beat a continuous scale nobody can compare by eye.
const strokeWidthForReads = (readCount: number) => {
  if (readCount >= 100) return 3;
  if (readCount >= 10) return 2.25;
  return 1.5;
};

// Reading the value is the consequential permission, so it is the one the edge colour reports.
const principalEdgeColor = (principal: TBlastRadiusPrincipal) =>
  principal.actions.includes(SecretActionName.ReadValue) ||
  principal.actions.includes(SecretActionName.DescribeAndReadValue)
    ? "var(--color-danger)"
    : "var(--color-neutral)";

const destinationEdgeColor = (destination: TBlastRadiusDestination) => {
  if (destination.status === DestinationStatus.Failed) return "var(--color-danger)";
  if (destination.status === DestinationStatus.Stale || destination.autoSync === false)
    return "var(--color-warning)";
  return "var(--color-success)";
};

export const buildBlastRadiusGraph = (
  blastRadius: TBlastRadius,
  options: { clusterUnusedAccess?: boolean; hideHealthyDestinations?: boolean } = {}
) => {
  const { ghostReaders, secret, window } = blastRadius;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Principals with no reads are the ones that come in bulk, so they are what collapses. Everything
  // observed stays drawn, because that is the part of the picture people are reading.
  const unusedPrincipals = options.clusterUnusedAccess
    ? blastRadius.principals.filter((principal) => !hasObservedReads(principal))
    : [];
  const isClustered = unusedPrincipals.length >= MIN_CLUSTERABLE;
  const clusteredIds = new Set(
    isClustered ? unusedPrincipals.map((principal) => principal.id) : []
  );
  const principals = blastRadius.principals.filter((principal) => !clusteredIds.has(principal.id));

  const destinations = options.hideHealthyDestinations
    ? blastRadius.destinations.filter(
        (destination) =>
          destination.status === DestinationStatus.Failed ||
          destination.status === DestinationStatus.Stale ||
          destination.autoSync === false
      )
    : blastRadius.destinations;

  const drawnPrincipalCount = principals.length + (isClustered ? 1 : 0);
  const principalY = stackColumn(drawnPrincipalCount, PRINCIPAL_NODE_HEIGHT);
  const principalColumnBottom = drawnPrincipalCount
    ? principalY(drawnPrincipalCount - 1) + PRINCIPAL_NODE_HEIGHT
    : 0;

  if (isClustered) {
    nodes.push({
      id: CLUSTER_NODE_ID,
      type: "cluster",
      position: { x: 0, y: principalY(principals.length) },
      width: NODE_WIDTH,
      height: PRINCIPAL_NODE_HEIGHT,
      data: {
        label: `+${unusedPrincipals.length} principals`,
        detail: `no reads in ${window.effectiveDays}d · click to expand`,
        count: unusedPrincipals.length,
        principals: unusedPrincipals
      } satisfies TClusterNodeData
    });

    edges.push({
      id: "edge-cluster-unused",
      source: CLUSTER_NODE_ID,
      target: SECRET_NODE_ID,
      type: "smoothstep",
      style: {
        stroke: "var(--color-neutral)",
        strokeWidth: 1.25,
        strokeDasharray: "6 6",
        opacity: 0.55
      },
      data: { observed: false }
    });
  }

  principals.forEach((principal, index) => {
    nodes.push({
      id: `principal-${principal.type}-${principal.id}`,
      type: "principal",
      position: { x: 0, y: principalY(index) },
      width: NODE_WIDTH,
      height: PRINCIPAL_NODE_HEIGHT,
      data: {
        principal,
        windowDays: window.effectiveDays,
        consumptionAvailable: window.consumptionAvailable
      } satisfies TPrincipalNodeData
    });

    const observed = hasObservedReads(principal);
    edges.push({
      id: `edge-principal-${principal.id}`,
      source: `principal-${principal.type}-${principal.id}`,
      target: SECRET_NODE_ID,
      type: "smoothstep",
      // Solid means observed, dashed means entitled but not seen in the window. Without activity data
      // every edge stays dashed, because unknown is not the same as unused.
      animated: false,
      style: {
        stroke: principalEdgeColor(principal),
        strokeWidth: observed ? strokeWidthForReads(principal.observed?.readCount ?? 0) : 1.25,
        strokeDasharray: observed ? undefined : "6 6",
        opacity: observed ? 0.9 : 0.55,
        // The dashed-to-solid upgrade is the moment activity data lands, so it eases rather than snaps.
        // 200ms, no spring, per the house motion rule.
        transition:
          "stroke-width 200ms ease-in-out, opacity 200ms ease-in-out, stroke 200ms ease-in-out"
      },
      data: { observed, principalId: principal.id }
    });
  });

  // Ghost readers get no edge: they have no path to the secret today, and drawing one would be a lie.
  // They stack downward from the band top rather than being centred like the columns above: mixing a
  // centred offset with an absolute band top is what previously overlapped them onto the last principal.
  const ghostBandTop = principalColumnBottom + GHOST_BAND_GAP;
  ghostReaders.forEach((ghost, index) => {
    nodes.push({
      id: `ghost-${ghost.actorId ?? ghost.label}-${index}`,
      type: "ghost",
      position: {
        x: 0,
        y: ghostBandTop + index * (GHOST_NODE_HEIGHT + ROW_GAP)
      },
      width: NODE_WIDTH,
      height: GHOST_NODE_HEIGHT,
      data: { ghost } satisfies TGhostNodeData
    });
  });

  nodes.push({
    id: SECRET_NODE_ID,
    type: "secret",
    position: { x: SECRET_COLUMN_X, y: -SECRET_NODE_HEIGHT / 2 },
    width: NODE_WIDTH,
    height: SECRET_NODE_HEIGHT,
    data: { secret, consumptionAvailable: window.consumptionAvailable } satisfies TSecretNodeData
  });

  const destinationY = stackColumn(destinations.length, DESTINATION_NODE_HEIGHT);
  destinations.forEach((destination, index) => {
    const nodeId = `destination-${destination.id}`;
    nodes.push({
      id: nodeId,
      type: "destination",
      position: { x: DESTINATION_COLUMN_X, y: destinationY(index) },
      width: NODE_WIDTH,
      height: DESTINATION_NODE_HEIGHT,
      data: { destination } satisfies TDestinationNodeData
    });

    const isBroken =
      destination.status === DestinationStatus.Failed || destination.autoSync === false;

    edges.push({
      id: `edge-destination-${destination.id}`,
      source: SECRET_NODE_ID,
      target: nodeId,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: destinationEdgeColor(destination) },
      style: {
        stroke: destinationEdgeColor(destination),
        strokeWidth: isBroken ? 2 : 1.75,
        strokeDasharray: isBroken ? "6 6" : undefined,
        opacity: 0.9
      },
      data: { destinationId: destination.id }
    });
  });

  return { nodes, edges };
};

export const principalNodeId = (principal: { id: string; type: PrincipalType }) =>
  `principal-${principal.type}-${principal.id}`;
