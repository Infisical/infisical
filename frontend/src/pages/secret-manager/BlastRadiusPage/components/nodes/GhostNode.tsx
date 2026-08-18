import { NodeProps } from "@xyflow/react";

import { TBlastRadiusConsumer } from "@app/hooks/api/blastRadius";

import { CALLER_KIND_LABEL, formatReadCount, relativeTime } from "../../utils/format";

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

      {/* The caller matters most here: a deleted identity is anonymous, but a deleted identity that was
          driven by a named workflow or service account still points at something you can go and check. */}
      {Boolean(ghost.callers.length) && (
        <span className="truncate font-mono text-xs text-muted" title={ghost.callers[0].detail}>
          {CALLER_KIND_LABEL[ghost.callers[0].kind]} {ghost.callers[0].label}
          {ghost.callerCount > 1 ? ` +${ghost.callerCount - 1}` : ""}
        </span>
      )}
    </div>
  );
};
