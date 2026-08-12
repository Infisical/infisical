import { NodeProps } from "@xyflow/react";
import { GhostIcon } from "lucide-react";

import { Badge } from "@app/components/v3";
import { ReadPrecision } from "@app/hooks/api/blastRadius";

import { TGhostNodeData } from "../../utils/buildGraph";
import { CLIENT_LABEL, formatReadCount, PRECISION_LABEL, relativeTime } from "../../utils/format";

/**
 * A principal that read this value and cannot read it today. Deliberately drawn with no edge to the
 * secret: there is no current path, and drawing one would misrepresent the access model.
 */
export const GhostReaderNode = ({ data }: NodeProps & { data: TGhostNodeData }) => {
  const { ghost } = data;

  return (
    <div className="flex h-full w-full flex-col justify-center gap-1 rounded-sm border border-dashed border-warning/40 bg-warning/5 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <GhostIcon size={13} className="shrink-0 text-warning" />
        <p className="truncate text-xs font-medium text-foreground">{ghost.label}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="warning">{ghost.principalExists ? "Access revoked" : "Deleted"}</Badge>
        {ghost.precision === ReadPrecision.Folder && (
          <Badge variant="ghost" className="text-muted">
            {PRECISION_LABEL[ReadPrecision.Folder]}
          </Badge>
        )}
        {ghost.clients.slice(0, 1).map((client) => (
          <Badge key={client} variant={client === "web" ? "info" : "ghost"} className="font-mono">
            {CLIENT_LABEL[client] ?? client}
          </Badge>
        ))}
      </div>

      <p className="truncate text-xs text-accent">
        {formatReadCount(ghost.readCount, ghost.precision)}{" "}
        {ghost.readCount === 1 ? "read" : "reads"} · {relativeTime(ghost.lastReadAt)}
      </p>
    </div>
  );
};
