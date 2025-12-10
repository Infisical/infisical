import { GenericFieldLabel } from "@app/components/v2";
import { AiMcpServerCredentialMode, TAiMcpServer } from "@app/hooks/api";

type Props = {
  server: TAiMcpServer;
};

const getCredentialModeLabel = (mode: AiMcpServerCredentialMode) => {
  const labels: Record<AiMcpServerCredentialMode, string> = {
    [AiMcpServerCredentialMode.SHARED]: "Shared Credentials",
    [AiMcpServerCredentialMode.PERSONAL]: "Personal Credentials"
  };
  return labels[mode] || "Unknown";
};

export const MCPServerCredentialsSection = ({ server }: Props) => {
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Credentials</h3>
      </div>
      <div className="space-y-3">
        <GenericFieldLabel label="Credential Mode">
          {getCredentialModeLabel(server.credentialMode)}
        </GenericFieldLabel>
      </div>
    </div>
  );
};
