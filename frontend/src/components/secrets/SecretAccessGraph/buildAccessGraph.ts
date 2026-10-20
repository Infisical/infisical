import { Edge, Node } from "@xyflow/react";

import { TSecretExposure } from "@app/hooks/api/secretInsights/types";

export type TAccessGraphActorType = "user" | "identity";

export type TAccessGraphReader = {
  id: string;
  name: string;
  type: TAccessGraphActorType;
  // Granted on their own; a reader can also have the value through groups at the same time.
  isDirect: boolean;
  groupIds: string[];
  // Project admins can read everything by design, so they are drawn but never count as unused access.
  isAdmin?: boolean;
  lastReadAt?: string;
  // Set when the reader counts as unused access: no read since this date, with the secret and their access
  // both older than the judged period. A reader with neither this nor a read is too new to judge.
  unreadSince?: string;
};

export type TAccessGraphGroup = {
  id: string;
  name: string;
  memberCount: number;
};

export type TAccessGraphGhost = {
  id: string;
  // Null when the reader has since been deleted.
  name: string | null;
  type: TAccessGraphActorType;
  lastReadAt: string;
};

export type TAccessGraphSecret = {
  key: string;
  environment: string;
  secretPath: string;
  exposure?: TSecretExposure;
};

export type TAccessGraphInput = {
  secret: TAccessGraphSecret;
  readers: TAccessGraphReader[];
  groups: TAccessGraphGroup[];
  ghosts: TAccessGraphGhost[];
  // False when the viewer cannot see read activity, so no edge claims a read or its absence.
  hasReadActivity: boolean;
  trackedSince?: string;
};

export type TReaderNodeData = {
  reader: TAccessGraphReader;
  groupNames: string[];
  hasReadActivity: boolean;
  trackedSince?: string;
};

export type TGroupNodeData = { group: TAccessGraphGroup };
export type TSecretNodeData = { secret: TAccessGraphSecret };
export type TGhostNodeData = { ghost: TAccessGraphGhost };
export type TBandLabelNodeData = { label: string; detail: string; tone?: "neutral" | "warning" };

export const NODE_WIDTH = 208;
const READER_NODE_HEIGHT = 84;
const GROUP_NODE_HEIGHT = 64;
const SECRET_NODE_HEIGHT = 104;
const GHOST_NODE_HEIGHT = 76;
const BAND_LABEL_HEIGHT = 36;
const BAND_GAP = 20;
const HEADER_GAP = 8;
// Three columns plus their gaps fit the sheet without horizontal panning.
const COLUMN_GAP = 96;
const ROW_GAP = 16;
const MARGIN = 24;
const COLUMN_TOP = MARGIN + BAND_LABEL_HEIGHT + HEADER_GAP;

export const SECRET_NODE_ID = "secret";
export const readerNodeId = (reader: Pick<TAccessGraphReader, "type" | "id">) =>
  `reader-${reader.type}-${reader.id}`;
export const groupNodeId = (group: Pick<TAccessGraphGroup, "id">) => `group-${group.id}`;

const columnHeight = (count: number, height: number) =>
  count ? count * height + (count - 1) * ROW_GAP : 0;

// Centres a column of `count` nodes against the tallest one. Positions are exact, so the canvas is sized to
// the content and nothing has to be fitted after the nodes are measured.
const centredOffset = (count: number, height: number, tallest: number) =>
  COLUMN_TOP + Math.max(0, (tallest - columnHeight(count, height)) / 2);

const stackColumn = (offset: number, height: number) => (index: number) =>
  offset + index * (height + ROW_GAP);

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

// Solid means a read in the window, dashed means entitled with none. Without read activity every edge is
// neutral, because unknown is not the same as unused, and so is an admin's, who is never counted.
const readerEdgeStyle = (reader: TAccessGraphReader, hasReadActivity: boolean) => {
  if (reader.lastReadAt && hasReadActivity) {
    return { stroke: "var(--color-foreground)", strokeWidth: 1.5, opacity: 0.55 };
  }
  if (!hasReadActivity || reader.isAdmin) {
    return { stroke: "var(--color-muted)", strokeWidth: 1, opacity: 0.5 };
  }
  return { stroke: "var(--color-muted)", strokeWidth: 1, strokeDasharray: "5 5", opacity: 0.45 };
};

export const buildAccessGraph = ({
  secret,
  readers,
  groups,
  ghosts,
  hasReadActivity,
  trackedSince
}: TAccessGraphInput) => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Unused access first, then readers too new to judge, then the ones who have read, then admins: the first
  // group is what the viewer is here to find.
  const rankOf = (reader: TAccessGraphReader) => {
    if (reader.isAdmin) return 3;
    if (!hasReadActivity) return 0;
    if (reader.lastReadAt) return 2;
    return reader.unreadSince ? 0 : 1;
  };
  const orderedReaders = [...readers].sort(
    (a, b) => rankOf(a) - rankOf(b) || a.name.localeCompare(b.name)
  );
  const groupById = new Map(groups.map((group) => [group.id, group]));

  const secretColumnX = MARGIN + (NODE_WIDTH + COLUMN_GAP) * (groups.length ? 2 : 1);
  const groupColumnX = MARGIN + NODE_WIDTH + COLUMN_GAP;

  const tallestColumn = Math.max(
    columnHeight(orderedReaders.length, READER_NODE_HEIGHT),
    columnHeight(groups.length, GROUP_NODE_HEIGHT),
    SECRET_NODE_HEIGHT
  );
  const readerOffset = centredOffset(orderedReaders.length, READER_NODE_HEIGHT, tallestColumn);
  const groupOffset = centredOffset(groups.length, GROUP_NODE_HEIGHT, tallestColumn);
  const secretOffset = COLUMN_TOP + (tallestColumn - SECRET_NODE_HEIGHT) / 2;
  const readerY = stackColumn(readerOffset, READER_NODE_HEIGHT);
  const groupY = stackColumn(groupOffset, GROUP_NODE_HEIGHT);

  nodes.push(
    bandLabelNode("band-readers", MARGIN, readerOffset, {
      label: `Can read · ${orderedReaders.length}`,
      detail: "can read the value today"
    }),
    bandLabelNode("band-secret", secretColumnX, secretOffset, {
      label: "Secret",
      detail: "the value they read"
    })
  );
  if (groups.length) {
    nodes.push(
      bandLabelNode("band-groups", groupColumnX, groupOffset, {
        label: `Groups · ${groups.length}`,
        detail: "grant the access"
      })
    );
  }

  orderedReaders.forEach((reader, index) => {
    const nodeId = readerNodeId(reader);
    const viaGroups = reader.groupIds.flatMap((groupId) => groupById.get(groupId) ?? []);
    nodes.push({
      id: nodeId,
      type: "reader",
      position: { x: MARGIN, y: readerY(index) },
      width: NODE_WIDTH,
      height: READER_NODE_HEIGHT,
      data: {
        reader,
        groupNames: viaGroups.map((group) => group.name),
        hasReadActivity,
        trackedSince
      } satisfies TReaderNodeData
    });

    const style = readerEdgeStyle(reader, hasReadActivity);
    // Every path that gives the reader the value is drawn: straight to the secret for their own grant, and
    // through each group that grants it too, so removing one path visibly leaves the others.
    if (reader.isDirect || !viaGroups.length) {
      edges.push({ id: `edge-${nodeId}-secret`, source: nodeId, target: SECRET_NODE_ID, style });
    }
    viaGroups.forEach((group) => {
      edges.push({
        id: `edge-${nodeId}-${groupNodeId(group)}`,
        source: nodeId,
        target: groupNodeId(group),
        style
      });
    });
  });

  groups.forEach((group, index) => {
    const nodeId = groupNodeId(group);
    nodes.push({
      id: nodeId,
      type: "group",
      position: { x: groupColumnX, y: groupY(index) },
      width: NODE_WIDTH,
      height: GROUP_NODE_HEIGHT,
      data: { group } satisfies TGroupNodeData
    });
    edges.push({
      id: `edge-${nodeId}-secret`,
      source: nodeId,
      target: SECRET_NODE_ID,
      style: { stroke: "var(--color-accent)", strokeWidth: 1.5, opacity: 0.5 }
    });
  });

  nodes.push({
    id: SECRET_NODE_ID,
    type: "secret",
    position: { x: secretColumnX, y: secretOffset },
    width: NODE_WIDTH,
    height: SECRET_NODE_HEIGHT,
    data: { secret } satisfies TSecretNodeData
  });

  // No edges from here on: a ghost reader has no current path to the secret, and drawing one would say
  // they can still read the value.
  const firstGhostY =
    readerOffset +
    columnHeight(orderedReaders.length, READER_NODE_HEIGHT) +
    BAND_GAP +
    BAND_LABEL_HEIGHT +
    HEADER_GAP;
  const ghostY = stackColumn(firstGhostY, GHOST_NODE_HEIGHT);
  if (ghosts.length) {
    nodes.push(
      bandLabelNode("band-ghosts", MARGIN, firstGhostY, {
        label: `Ghost readers · ${ghosts.length}`,
        detail: "no path to the secret",
        tone: "warning"
      })
    );
    ghosts.forEach((ghost, index) => {
      nodes.push({
        id: `ghost-${ghost.type}-${ghost.id}`,
        type: "ghost",
        position: { x: MARGIN, y: ghostY(index) },
        width: NODE_WIDTH,
        height: GHOST_NODE_HEIGHT,
        selectable: false,
        data: { ghost } satisfies TGhostNodeData
      });
    });
  }

  const contentHeight =
    (ghosts.length
      ? firstGhostY + columnHeight(ghosts.length, GHOST_NODE_HEIGHT)
      : COLUMN_TOP + tallestColumn) + MARGIN;
  const contentWidth = secretColumnX + NODE_WIDTH + MARGIN;

  return { nodes, edges, contentHeight, contentWidth };
};
