import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v3";
import { useRevokeGatewayAccess } from "@app/hooks/api/gateways-v2";

type Props = {
  gatewayId: string;
  canRevoke: boolean;
  isAllowed: boolean;
  isAllowedToRevoke: boolean;
  onShowCommand: () => void;
};

export const GatewayDeployAwsContent = ({
  gatewayId,
  canRevoke,
  isAllowed,
  isAllowedToRevoke,
  onShowCommand
}: Props) => {
  const { mutateAsync: revoke, isPending: isRevoking } = useRevokeGatewayAccess();

  const handleRevoke = async () => {
    try {
      await revoke({ gatewayId });
      createNotification({ type: "success", text: "Gateway access revoked" });
    } catch {
      createNotification({ type: "error", text: "Failed to revoke gateway access" });
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="neutral" size="sm" isDisabled={!isAllowed} onClick={onShowCommand}>
        Show start command
      </Button>
      {canRevoke && (
        <Button
          variant="danger"
          size="sm"
          isPending={isRevoking}
          isDisabled={!isAllowedToRevoke || isRevoking}
          onClick={handleRevoke}
        >
          Revoke access
        </Button>
      )}
    </div>
  );
};
