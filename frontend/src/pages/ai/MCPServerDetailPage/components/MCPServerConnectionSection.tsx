import { GenericFieldLabel } from "@app/components/v2";
import { AiMcpServerAuthMethod, TAiMcpServer } from "@app/hooks/api";

type Props = {
  server: TAiMcpServer;
};

const getAuthMethodLabel = (method: AiMcpServerAuthMethod) => {
  const labels: Record<AiMcpServerAuthMethod, string> = {
    [AiMcpServerAuthMethod.BASIC]: "Basic Auth",
    [AiMcpServerAuthMethod.BEARER]: "API Token",
    [AiMcpServerAuthMethod.OAUTH]: "OAuth"
  };
  return labels[method] || "Unknown";
};

export const MCPServerConnectionSection = ({ server }: Props) => {
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="font-medium text-mineshaft-100">Connection</h3>
      </div>
      <div className="space-y-3">
        <GenericFieldLabel label="Endpoint" truncate>
          {server.url}
        </GenericFieldLabel>
        <GenericFieldLabel label="Authentication">
          {getAuthMethodLabel(server.authMethod)}
        </GenericFieldLabel>
      </div>
    </div>
  );
};
