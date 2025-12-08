import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { GenericFieldLabel, IconButton, Tooltip } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { TAiMcpEndpointWithServerIds } from "@app/hooks/api";

type Props = {
  endpoint: TAiMcpEndpointWithServerIds;
};

export const MCPEndpointConnectionSection = ({ endpoint }: Props) => {
  const [isCopied, setIsCopied] = useToggle(false);
  const endpointUrl = `${window.location.origin}/api/v1/ai/mcp-endpoints/${endpoint.id}/connect`;

  const handleCopy = () => {
    navigator.clipboard.writeText(endpointUrl);
    setIsCopied.on();
    createNotification({
      text: "Endpoint URL copied to clipboard",
      type: "info"
    });
    setTimeout(() => setIsCopied.off(), 2000);
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="font-medium text-mineshaft-100">Connection</h3>
      </div>
      <div className="space-y-3">
        <GenericFieldLabel label="Endpoint URL">
          <div className="flex items-center gap-2">
            <div className="flex-1 overflow-hidden rounded border border-mineshaft-500 bg-mineshaft-700">
              <code className="block overflow-x-auto px-3 py-2 font-mono text-sm whitespace-nowrap text-mineshaft-200">
                {endpointUrl}
              </code>
            </div>
            <Tooltip content={isCopied ? "Copied!" : "Copy URL"}>
              <IconButton
                ariaLabel="Copy endpoint URL"
                variant="outline_bg"
                size="sm"
                onClick={handleCopy}
              >
                <FontAwesomeIcon icon={isCopied ? faCheck : faCopy} />
              </IconButton>
            </Tooltip>
          </div>
        </GenericFieldLabel>
      </div>
    </div>
  );
};
