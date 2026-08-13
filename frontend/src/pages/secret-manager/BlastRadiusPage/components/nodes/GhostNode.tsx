import { NodeProps } from "@xyflow/react";

import { TBlastRadiusConsumer } from "@app/hooks/api/blastRadius";

import { formatReadCount, relativeTime } from "../../utils/format";

export type TGhostNodeData = {
  ghost: TBlastRadiusConsumer;
};

/**
 * A principal that read this value and cannot read it today. Deliberately has no `Handle`: there is no
 * current path from it to the secret, and drawing an edge would misrepresent the access model. It sits in
 * the entitled column because that is where the reader is already looking for people.
 */
export const GhostNode = ({ data }: NodeProps & { data: TGhostNodeData }) => {
  const { ghost } = data;

  return (
    <div className="flex h-full w-full flex-col gap-1 rounded-md border border-warning/40 bg-warning/5 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate font-mono text-xs text-foreground">{ghost.label}</p>
        <span className="shrink-0 text-xs text-muted">{ghost.actorType}</span>
      </div>

      {/* Which of the two states it is decides whether anyone can still be asked about it. */}
      <span className="truncate text-xs text-warning">
        {ghost.principalExists ? "Access revoked" : "Deleted"}
      </span>

      <span className="mt-auto truncate text-xs text-accent">
        {formatReadCount(ghost.readCount, ghost.precision)}{" "}
        {ghost.readCount === 1 ? "read" : "reads"} · {relativeTime(ghost.lastReadAt)}
      </span>
    </div>
  );
};
