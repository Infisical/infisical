import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Badge, Button } from "@app/components/v3";
import { OrgPermissionHoneyTokenActions, OrgPermissionSubjects } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  HoneyTokenConfigStatus,
  HoneyTokenType,
  useGetHoneyTokenConfig,
  useTestHoneyTokenConnection
} from "@app/hooks/api/honeyToken";

import { HoneyTokenModal } from "./HoneyTokenModal";

export const HoneyTokenSection = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["honeyTokenModal"] as const);

  const { data: existingConfig } = useGetHoneyTokenConfig(HoneyTokenType.AWS, {
    retry: false
  });
  const { mutateAsync: testConnection, isPending: isTesting } = useTestHoneyTokenConnection();

  const hasConfig = Boolean(existingConfig);
  const isConfigVerified = existingConfig?.status === HoneyTokenConfigStatus.Complete;

  const handleTestConnection = async () => {
    try {
      const result = await testConnection(HoneyTokenType.AWS);
      if (result.isConnected) {
        createNotification({
          text: `CloudFormation stack "${result.stackName}" is deployed and healthy.`,
          type: "success"
        });
      } else {
        createNotification({
          text: result.status
            ? `Stack "${result.stackName}" is not ready (status: ${result.status}).`
            : `Stack "${result.stackName}" was not found. Deploy the stack first.`,
          type: "error"
        });
      }
    } catch {
      createNotification({
        text: "Failed to test connection. Check your AWS App Connection permissions.",
        type: "error"
      });
    }
  };

  return (
    <div className="mt-6 border-t border-mineshaft-600 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium text-mineshaft-100">AWS Honey Tokens</h3>
            {hasConfig && (
              <Badge variant={isConfigVerified ? "success" : "warning"}>
                {isConfigVerified ? "Verified" : "Pending Verification"}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-mineshaft-400">
            Plant decoy IAM credentials in your AWS account. Infisical alerts on every access
            attempt.
          </p>
        </div>
        <OrgPermissionCan
          I={OrgPermissionHoneyTokenActions.Setup}
          a={OrgPermissionSubjects.HoneyTokens}
        >
          {(isAllowed) => (
            <div className="flex gap-2">
              {hasConfig && (
                <Button
                  variant="outline"
                  isDisabled={!isAllowed || isTesting}
                  isPending={isTesting}
                  onClick={handleTestConnection}
                >
                  Verify Connection
                </Button>
              )}
              <Button
                variant="org"
                isDisabled={!isAllowed}
                onClick={() => handlePopUpOpen("honeyTokenModal")}
              >
                {hasConfig ? "Manage" : "Connect"}
              </Button>
            </div>
          )}
        </OrgPermissionCan>
      </div>
      <HoneyTokenModal
        isOpen={popUp.honeyTokenModal.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("honeyTokenModal", isOpen)}
      />
    </div>
  );
};
