import { faBan } from "@fortawesome/free-solid-svg-icons";

import { createNotification } from "@app/components/notifications";
import { EmptyState, Spinner } from "@app/components/v2";
import { Button } from "@app/components/v3";
import { useConfigureGatewayTokenAuth } from "@app/hooks/api/gateways-v2/mutations";
import { useGetResourceTokenAuth } from "@app/hooks/api/resourceAuthMethods";

type Props = {
  gatewayId: string;
  onTokenGenerated: (token: string) => void;
};

export const ViewGatewayTokenAuthContent = ({ gatewayId, onTokenGenerated }: Props) => {
  const { data, isPending } = useGetResourceTokenAuth({ type: "gateway", id: gatewayId });
  // Token generation goes through the legacy v3 endpoint (used by the deployed CLI). The new
  // resource-token-auth router intentionally does not expose a token-generate endpoint —
  // see plan #3.
  const { mutateAsync: generateToken, isPending: isGenerating } = useConfigureGatewayTokenAuth();

  if (isPending) {
    return (
      <div className="flex w-full items-center justify-center">
        <Spinner className="text-mineshaft-400" />
      </div>
    );
  }

  if (!data) {
    return <EmptyState icon={faBan} title="Could not find Token Auth on this gateway." />;
  }

  const handleGenerate = async () => {
    try {
      const result = await generateToken({ gatewayId });
      onTokenGenerated(result.token);
    } catch {
      createNotification({ type: "error", text: "Failed to generate enrollment token" });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-mineshaft-300">
        Generate a one-time enrollment token and pass it to the gateway at start time.
      </p>
      <div>
        <Button variant="outline" size="xs" isDisabled={isGenerating} onClick={handleGenerate}>
          {isGenerating ? "Generating..." : "Generate new enrollment token"}
        </Button>
      </div>
    </div>
  );
};
