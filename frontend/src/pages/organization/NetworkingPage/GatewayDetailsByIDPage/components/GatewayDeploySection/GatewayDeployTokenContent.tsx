import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v3";
import { useMintGatewayToken, useRevokeGatewayAccess } from "@app/hooks/api/gateways-v2";

import { EnrollmentTokenDialog } from "../GatewayAuthenticationSection/EnrollmentTokenDialog";

type Props = {
  gatewayId: string;
  gatewayName: string;
  // tokenVersion > 0 ⇒ this gateway has had a JWT minted at some point and is a valid
  // target for Revoke. The button stays hidden for fresh gateways with no auth artifacts.
  canRevoke: boolean;
  isAllowed: boolean;
  isAllowedToRevoke: boolean;
};

export const GatewayDeployTokenContent = ({
  gatewayId,
  gatewayName,
  canRevoke,
  isAllowed,
  isAllowedToRevoke
}: Props) => {
  const [enrollmentToken, setEnrollmentToken] = useState<string | null>(null);
  const { mutateAsync: mint, isPending: isMinting } = useMintGatewayToken();
  const { mutateAsync: revoke, isPending: isRevoking } = useRevokeGatewayAccess();

  const handleMint = async () => {
    try {
      const result = await mint({ gatewayId });
      setEnrollmentToken(result.token);
    } catch {
      createNotification({ type: "error", text: "Failed to generate enrollment token" });
    }
  };

  const handleRevoke = async () => {
    try {
      await revoke({ gatewayId });
      createNotification({ type: "success", text: "Gateway access revoked" });
    } catch {
      createNotification({ type: "error", text: "Failed to revoke gateway access" });
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="neutral"
          size="sm"
          isPending={isMinting}
          isDisabled={!isAllowed || isMinting}
          onClick={handleMint}
        >
          {canRevoke ? "Regenerate enrollment token" : "Generate enrollment token"}
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

      {enrollmentToken && (
        <EnrollmentTokenDialog
          isOpen
          onOpenChange={(open) => !open && setEnrollmentToken(null)}
          gatewayName={gatewayName}
          enrollmentToken={enrollmentToken}
        />
      )}
    </>
  );
};
