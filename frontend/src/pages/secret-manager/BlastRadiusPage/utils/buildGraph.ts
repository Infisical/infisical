import { Edge, MarkerType, Node } from "@xyflow/react";

import {
  DestinationStatus,
  PrincipalType,
  TBlastRadius,
  TBlastRadiusDestination,
  TBlastRadiusPrincipal
} from "@app/hooks/api/blastRadius";

import { TBandLabelNodeData } from "../components/nodes/BandLabelNode";
import { TGhostNodeData } from "../components/nodes/GhostNode";

export const NODE_WIDTH = 208;
export const PRINCIPAL_NODE_HEIGHT = 96;
export const SECRET_NODE_HEIGHT = 116;
export const DESTINATION_NODE_HEIGHT = 76;
export const GHOST_NODE_HEIGHT = 88;

// The ghost band is separated from the entitled stack by more than a row gap, because the gap is what
// carries "these are a different kind of thing" once the edges are gone.
const BAND_LABEL_HEIGHT = 36;
const BAND_GAP = 20;
const HEADER_GAP = 8;

// Gaps are chosen so all three columns fit a drawer without horizontal panning: 3 nodes plus 2 gaps
// plus margins lands just inside the 66rem sheet.
const COLUMN_GAP = 124;
const ROW_GAP = 16;
const MARGIN = 24;
const SECRET_COLUMN_X = MARGIN + NODE_WIDTH + COLUMN_GAP;
const DESTINATION_COLUMN_X = MARGIN + (NODE_WIDTH + COLUMN_GAP) * 2;

// Enough room above the tallest column for its header, since each header hangs off its own column's first
// node rather than sitting at a shared top edge.
const COLUMN_TOP = MARGIN + BAND_LABEL_HEIGHT + HEADER_GAP;

export type TPrincipalNodeData = {
  principal: TBlastRadiusPrincipal;
  windowDays: number;
  consumptionAvailable: boolean;
};

export type TSecretNodeData = {
  secret: TBlastRadius["secret"];
};

export type TDestinationNodeData = {
  destination: TBlastRadiusDestination;
};

export const SECRET_NODE_ID = "secret";
export const GHOST_BAND_NODE_ID = "ghost-band";

const columnHeight = (count: number, height: number) =>
  count ? count * height + (count - 1) * ROW_GAP : 0;

/**
 * Offset that centres a column of `count` nodes against the tallest column.
 *
 * Deliberately not React Flow's `fitView`: fitting raced node measurement and kept settling on a
 * transform that clipped the tallest column. Positions are known exactly here, so the canvas is sized
 * to the content and the viewport never has to move.
 */
const centredOffset = (count: number, height: number, tallest: number) =>
  COLUMN_TOP + Math.max(0, (tallest - columnHeight(count, height)) / 2);

const stackColumn = (offset: number, height: number) => (index: number) =>
  offset + index * (height + ROW_GAP);

/**
 * A band label sits directly above the first node of its band, not at a shared top edge: a centred column
 * starts well below the canvas top, and a header stranded up there stops reading as that column's header.
 * `firstNodeY` is the node it labels, and the label grows upwards from it.
 */
const bandLabelNode = (
  id: string,
  x: number,
  firstNodeY: number,
  data: TBandLabelNodeData
): Node => ({
  id,
  type: "bandLabel",
  position: { x, y: firstNodeY - HEADER_GAP - BAND_LABEL_HEIGHT },
  width: NODE_WIDTH,
  height: BAND_LABEL_HEIGHT,
  selectable: false,
  data
});

const hasObservedReads = (principal: TBlastRadiusPrincipal) =>
  (principal.observed?.readCount ?? 0) > 0;

// Read volume spans orders of magnitude, so thickness is stepped rather than proportional: two legible
// steps beat a continuous scale nobody can compare by eye.
const strokeWidthForReads = (readCount: number) => (readCount >= 100 ? 2 : 1.5);

// Edge colour reports health, not permission: permission is on the node, where it can be labelled. Green
// for healthy matches the `synced` label on the node it points at, so the edge and the node it lands on
// never disagree about the same fact.
const destinationEdgeColor = (destination: TBlastRadiusDestination) => {
  if (destination.status === DestinationStatus.Failed) return "var(--color-danger)";
  if (destination.status === DestinationStatus.Stale || destination.autoSync === false)
    return "var(--color-warning)";
  return "var(--color-success)";
};

export const buildBlastRadiusGraph = (
  blastRadius: TBlastRadius,
  options: {
    hideHealthyDestinations?: boolean;
  }
) => {
  const { secret, window } = blastRadius;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Every entitled principal is drawn. Folding the unused ones into a cluster was worse than the
  // crowding it avoided: on a secret nobody has read, every principal qualifies, so the whole column
  // collapsed into one box and the graph showed nothing at all.
  const { principals } = blastRadius;

  const destinations = options.hideHealthyDestinations
    ? blastRadius.destinations.filter(
        (destination) =>
          destination.status === DestinationStatus.Failed ||
          destination.status === DestinationStatus.Stale ||
          destination.autoSync === false
      )
    : blastRadius.destinations;

  // Ghosts hang below the entitled stack rather than being mixed into it, and they are excluded from the
  // centring so the secret stays aligned with the principals that actually connect to it.
  const { ghostReaders } = blastRadius;

  const tallestColumn = Math.max(
    columnHeight(principals.length, PRINCIPAL_NODE_HEIGHT),
    columnHeight(destinations.length, DESTINATION_NODE_HEIGHT),
    SECRET_NODE_HEIGHT
  );
  const principalOffset = centredOffset(principals.length, PRINCIPAL_NODE_HEIGHT, tallestColumn);
  const principalY = stackColumn(principalOffset, PRINCIPAL_NODE_HEIGHT);
  const secretOffset = COLUMN_TOP + (tallestColumn - SECRET_NODE_HEIGHT) / 2;
  const destinationOffset = centredOffset(
    destinations.length,
    DESTINATION_NODE_HEIGHT,
    tallestColumn
  );

  // Column headers are nodes on the canvas rather than a bar above it, so each one sits with the column it
  // names, scrolls with it, and can carry the sentence that says what the column means.
  nodes.push(
    bandLabelNode("band-entitled", MARGIN, principalOffset, {
      label: `Entitled · ${blastRadius.truncated.principals.total}`,
      detail: "can read the value today"
    }),
    bandLabelNode("band-secret", SECRET_COLUMN_X, secretOffset, {
      label: "Secret",
      detail: "the value they read"
    }),
    bandLabelNode("band-destinations", DESTINATION_COLUMN_X, destinationOffset, {
      label: `Destinations · ${blastRadius.destinations.length}`,
      detail: "where the value has travelled"
    })
  );

  principals.forEach((principal, index) => {
    const nodeId = `principal-${principal.type}-${principal.id}`;
    nodes.push({
      id: nodeId,
      type: "principal",
      position: { x: MARGIN, y: principalY(index) },
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
      source: nodeId,
      target: SECRET_NODE_ID,
      // Solid means observed, dashed means entitled but not seen in the window. With no activity data
      // every edge stays dashed, because unknown is not the same as unused.
      style: {
        stroke: observed ? "var(--color-foreground)" : "var(--color-muted)",
        strokeWidth: observed ? strokeWidthForReads(principal.observed?.readCount ?? 0) : 1,
        strokeDasharray: observed ? undefined : "5 5",
        opacity: observed ? 0.55 : 0.4,
        // The dashed-to-solid upgrade is the moment activity lands, so it eases rather than snaps.
        transition:
          "stroke-width 200ms ease-in-out, opacity 200ms ease-in-out, stroke 200ms ease-in-out"
      },
      data: { observed, principalId: principal.id }
    });
  });

  // No edges from here on for this column: a ghost reader has no current path to the secret, and drawing
  // one would say it can still read the value.
  const firstGhostY =
    principalOffset +
    columnHeight(principals.length, PRINCIPAL_NODE_HEIGHT) +
    BAND_GAP +
    BAND_LABEL_HEIGHT +
    HEADER_GAP;
  const ghostY = stackColumn(firstGhostY, GHOST_NODE_HEIGHT);

  if (ghostReaders.length) {
    nodes.push(
      bandLabelNode(GHOST_BAND_NODE_ID, MARGIN, firstGhostY, {
        label: `Ghost readers · ${ghostReaders.length}`,
        detail: "no path to the secret",
        tone: "warning"
      })
    );

    ghostReaders.forEach((ghost, index) => {
      nodes.push({
        id: `ghost-${ghost.actorId ?? ghost.label}-${ghost.lastReadAt}`,
        type: "ghost",
        position: { x: MARGIN, y: ghostY(index) },
        width: NODE_WIDTH,
        height: GHOST_NODE_HEIGHT,
        selectable: false,
        data: { ghost } satisfies TGhostNodeData
      });
    });
  }

  nodes.push({
    id: SECRET_NODE_ID,
    type: "secret",
    position: { x: SECRET_COLUMN_X, y: secretOffset },
    width: NODE_WIDTH,
    height: SECRET_NODE_HEIGHT,
    data: { secret } satisfies TSecretNodeData
  });

  const destinationY = stackColumn(destinationOffset, DESTINATION_NODE_HEIGHT);
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
    const color = destinationEdgeColor(destination);

    edges.push({
      id: `edge-destination-${destination.id}`,
      source: SECRET_NODE_ID,
      target: nodeId,
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
      style: {
        stroke: color,
        strokeWidth: isBroken ? 1.5 : 1.25,
        strokeDasharray: isBroken ? "5 5" : undefined,
        // Healthy sits a little quieter than a problem, so a screen of green does not compete with the
        // one red edge that needs attention.
        opacity: isBroken || destination.status === DestinationStatus.Stale ? 0.85 : 0.65
      },
      data: { destinationId: destination.id }
    });
  });

  const ghostColumnBottom = ghostReaders.length
    ? ghostY(ghostReaders.length - 1) + GHOST_NODE_HEIGHT
    : 0;

  return {
    nodes,
    edges,
    contentHeight: Math.max(COLUMN_TOP + tallestColumn, ghostColumnBottom) + MARGIN,
    contentWidth: DESTINATION_COLUMN_X + NODE_WIDTH + MARGIN
  };
};

export const principalNodeId = (principal: { id: string; type: PrincipalType }) =>
  `principal-${principal.type}-${principal.id}`;
