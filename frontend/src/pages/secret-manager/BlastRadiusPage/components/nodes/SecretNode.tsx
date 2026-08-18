import { Handle, NodeProps, Position } from "@xyflow/react";

import { TSecretNodeData } from "../../utils/buildGraph";

export const SecretNode = ({ data }: NodeProps & { data: TSecretNodeData }) => {
  const { secret } = data;

  return (
    <div className="flex h-full w-full flex-col gap-1 rounded-md border border-secret/50 bg-secret/10 px-2.5 py-2">
      <span className="text-xs tracking-wide text-accent uppercase">Secret</span>
      <p className="truncate font-mono text-sm text-foreground">{secret.key}</p>
      <p className="truncate font-mono text-xs text-accent">
        {secret.secretPath} · {secret.environment}
      </p>
      <div className="mt-auto border-t border-secret/25 pt-1.5">
        <p className="truncate font-mono text-xs text-muted">
          v{secret.version} · rotation: {secret.isRotationManaged ? "auto" : "manual"}
          {secret.hasApprovalPolicy ? " · approval" : ""}
        </p>
      </div>

      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  );
};
