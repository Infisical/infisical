import { Handle, NodeProps, Position } from "@xyflow/react";
import { KeyRoundIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";

import { Badge } from "@app/components/v3";

import { TSecretNodeData } from "../../utils/buildGraph";

export const SecretNode = ({ data }: NodeProps & { data: TSecretNodeData }) => {
  const { secret, consumptionAvailable } = data;

  return (
    <div className="flex h-full w-full flex-col justify-center gap-1.5 rounded-sm border border-secret/40 bg-secret/10 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <KeyRoundIcon size={14} className="shrink-0 text-secret" />
        <p className="truncate font-mono text-sm font-medium text-foreground">{secret.key}</p>
      </div>
      <p className="truncate font-mono text-xs text-accent">
        {secret.secretPath} · {secret.environment}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="ghost" className="font-mono text-xs text-accent">
          v{secret.version}
        </Badge>
        <Badge variant={secret.isRotationManaged ? "success" : "neutral"}>
          <RefreshCwIcon />
          {secret.isRotationManaged ? "rotation: auto" : "rotation: manual"}
        </Badge>
        {secret.hasApprovalPolicy && (
          <Badge variant="info">
            <ShieldCheckIcon />
            approval
          </Badge>
        )}
      </div>
      {!consumptionAvailable && (
        <p className="text-xs text-muted">Read activity is hidden for your role.</p>
      )}

      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  );
};
