import { Edge, Node } from "@xyflow/react";

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

export type TAccessGraphSecret = {
  key: string;
  environment: string;
  secretPath: string;
};

export type TAccessGraphInput = {
  secret: TAccessGraphSecret;
  readers: TAccessGraphReader[];
  groups: TAccessGraphGroup[];
  // False when the viewer cannot see read activity, so no edge claims a read or its absence.
  hasReadActivity: boolean;
  trackedSince?: string;
};

export type TReaderNodeData = {
  reader: TAccessGraphReader;
  groupNames: string[];
  hasReadActivity: boolean;
};

export type TSecretNodeData = { secret: TAccessGraphSecret };
export type TBandLabelNodeData = { label: string; detail: string; tone?: "neutral" | "warning" };
export type TLaneEdgeData = { centerX: number };

export const NODE_WIDTH = 240;
const READER_NODE_HEIGHT = 74;
const SECRET_NODE_HEIGHT = 64;
const BAND_LABEL_HEIGHT = 36;
const HEADER_GAP = 8;
const COLUMN_GAP = 160;
const ROW_GAP = 14;
const MARGIN = 24;
const COLUMN_TOP = MARGIN + BAND_LABEL_HEIGHT + HEADER_GAP;
// Where the first line bends before the secret, and how far apart parallel bends are.
const LANE_INSET = 24;
const MAX_LANE_STEP = 10;

export const SECRET_NODE_ID = "secret";
export const readerNodeId = (reader: Pick<TAccessGraphReader, "type" | "id">) =>
  `reader-${reader.type}-${reader.id}`;

const columnHeight = (count: number, height: number) =>
  count ? count * height + (count - 1) * ROW_GAP : 0;

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

// Each line bends in its own vertical lane before the secret. The reader farthest above (or below) the
// secret bends closest to it, so no line's horizontal run crosses another's bend. Lines from above and from
// below can share a lane: their vertical runs never overlap.
const assignLanes = (
  sources: { edgeId: string; y: number }[],
  targetY: number,
  targetX: number
) => {
  const centerXByEdgeId = new Map<string, number>();
  const place = (side: typeof sources) => {
    const step = Math.min(MAX_LANE_STEP, (COLUMN_GAP - 2 * LANE_INSET) / Math.max(1, side.length));
    [...side]
      .sort((a, b) => Math.abs(b.y - targetY) - Math.abs(a.y - targetY))
      .forEach((source, index) => {
        centerXByEdgeId.set(source.edgeId, targetX - LANE_INSET - index * step);
      });
  };
  place(sources.filter((source) => source.y <= targetY));
  place(sources.filter((source) => source.y > targetY));
  return centerXByEdgeId;
};

export const buildAccessGraph = ({
  secret,
  readers,
  groups,
  hasReadActivity
}: TAccessGraphInput) => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));

  // Unused access first, then readers too new to judge, then the ones who have read, then admins: the
  // first group is what the viewer is here to find.
  const rankOf = (reader: TAccessGraphReader) => {
    if (reader.isAdmin) return 3;
    if (!hasReadActivity) return 0;
    if (reader.lastReadAt) return 2;
    return reader.unreadSince ? 0 : 1;
  };
  const orderedReaders = [...readers].sort(
    (a, b) => rankOf(a) - rankOf(b) || a.name.localeCompare(b.name)
  );

  const secretColumnX = MARGIN + NODE_WIDTH + COLUMN_GAP;
  const readerY = stackColumn(COLUMN_TOP, READER_NODE_HEIGHT);
  const readerCenterY = (index: number) => readerY(index) + READER_NODE_HEIGHT / 2;
  const readersBottom = COLUMN_TOP + columnHeight(orderedReaders.length, READER_NODE_HEIGHT);
  // The secret sits level with the middle of the readers.
  const secretY = Math.max(COLUMN_TOP, (COLUMN_TOP + readersBottom - SECRET_NODE_HEIGHT) / 2);

  nodes.push(
    bandLabelNode("band-readers", MARGIN, COLUMN_TOP, {
      label: `Can read · ${orderedReaders.length}`,
      detail: "users and machine identities, directly or through a group"
    })
  );

  // Every reader has one line to the secret; how they have the value, directly or through which groups, is
  // written on the reader rather than drawn, which keeps the lines from crossing.
  const lanes = assignLanes(
    orderedReaders.map((reader, index) => ({
      edgeId: `edge-${readerNodeId(reader)}-secret`,
      y: readerCenterY(index)
    })),
    secretY + SECRET_NODE_HEIGHT / 2,
    secretColumnX
  );
  orderedReaders.forEach((reader, index) => {
    const nodeId = readerNodeId(reader);
    nodes.push({
      id: nodeId,
      type: "reader",
      position: { x: MARGIN, y: readerY(index) },
      width: NODE_WIDTH,
      height: READER_NODE_HEIGHT,
      data: {
        reader,
        groupNames: reader.groupIds.flatMap((groupId) => groupNameById.get(groupId) ?? []),
        hasReadActivity
      } satisfies TReaderNodeData
    });
    const edgeId = `edge-${nodeId}-secret`;
    edges.push({
      id: edgeId,
      source: nodeId,
      target: SECRET_NODE_ID,
      type: "lane",
      style: readerEdgeStyle(reader, hasReadActivity),
      data: { centerX: lanes.get(edgeId) ?? secretColumnX - LANE_INSET } satisfies TLaneEdgeData
    });
  });

  nodes.push({
    id: SECRET_NODE_ID,
    type: "secret",
    position: { x: secretColumnX, y: secretY },
    width: NODE_WIDTH,
    height: SECRET_NODE_HEIGHT,
    data: { secret } satisfies TSecretNodeData
  });

  const contentHeight = Math.max(readersBottom, secretY + SECRET_NODE_HEIGHT) + MARGIN;
  const contentWidth = secretColumnX + NODE_WIDTH + MARGIN;

  return { nodes, edges, contentHeight, contentWidth };
};
