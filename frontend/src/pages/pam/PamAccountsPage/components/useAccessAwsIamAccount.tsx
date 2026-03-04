import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { PamResourceType, TPamAccount, useAccessPamAccount } from "@app/hooks/api/pam";
import { TAwsIamCredentials } from "@app/hooks/api/pam/types";

export const useAccessAwsIamAccount = () => {
  const accessPamAccount = useAccessPamAccount();
  const [loadingAccountId, setLoadingAccountId] = useState<string | null>(null);

  const accessAwsIam = async (account: TPamAccount) => {
    if (account.resource.resourceType !== PamResourceType.AwsIam) {
      return false;
    }

    setLoadingAccountId(account.id);

    try {
      const response = await accessPamAccount.mutateAsync({
        accountId: account.id,
        resourceName: account.resource.name,
        accountName: account.name,
        projectId: account.projectId,
        duration: `${(account.credentials as TAwsIamCredentials).defaultSessionDuration}s`
      });

      if (response.consoleUrl) {
        // Open the AWS Console URL in a new tab
        window.open(response.consoleUrl, "_blank", "noopener,noreferrer");

        createNotification({
          text: "AWS Console opened in new tab",
          type: "success"
        });

        return true;
      }

      createNotification({
        text: "Failed to generate AWS Console URL",
        type: "error"
      });

      return false;
    } finally {
      setLoadingAccountId(null);
    }
  };

  return {
    accessAwsIam,
    isPending: accessPamAccount.isPending,
    loadingAccountId
  };
};
