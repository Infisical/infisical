import { GenericFieldLabel } from "@app/components/v2";
import { TAiMcpEndpointWithServerIds } from "@app/hooks/api";

type Props = {
  endpoint: TAiMcpEndpointWithServerIds;
};

export const MCPEndpointConnectionSection = ({ endpoint }: Props) => {
  // Generate a mock endpoint URL based on the endpoint name
  const endpointUrl = `mcp://${endpoint.name.toLowerCase().replace(/\s+/g, "-")}.infisical.com:8080`;

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="font-medium text-mineshaft-100">Connection</h3>
      </div>
      <div className="space-y-3">
        <GenericFieldLabel label="Endpoint">
          <code className="rounded bg-mineshaft-700 px-2 py-1 font-mono text-sm text-mineshaft-200">
            {endpointUrl}
          </code>
        </GenericFieldLabel>
      </div>
    </div>
  );
};
