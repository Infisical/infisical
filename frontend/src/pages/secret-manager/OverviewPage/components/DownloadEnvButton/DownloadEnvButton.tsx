import { useState } from "react";
import { AxiosError } from "axios";
import { DownloadIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Tooltip, TooltipContent, TooltipTrigger, UnstableIconButton } from "@app/components/v3";
import { downloadSecretEnvFile } from "@app/helpers/download";
import { fetchProjectSecrets } from "@app/hooks/api/secrets/queries";
import { ApiErrorTypes, ProjectEnv, TApiErrors } from "@app/hooks/api/types";

type Props = {
  secretPath: string;
  environments: ProjectEnv[];
  projectId: string;
};

export const DownloadEnvButton = ({ environments, projectId, secretPath }: Props) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const isExportDisabled = environments.length === 1 && environments[0].allowSecretExport === false;

  const handleSecretDownload = async () => {
    if (environments.length !== 1) return;

    if (isExportDisabled) {
      createNotification({
        title: "Secret export is disabled",
        text: "An administrator has disabled secret export for this environment.",
        type: "error"
      });
      return;
    }

    const environment = environments[0].slug;

    setIsDownloading(true);
    try {
      const { secrets: localSecrets, imports: localImportedSecrets } = await fetchProjectSecrets({
        projectId,
        expandSecretReferences: true,
        includeImports: true,
        environment,
        secretPath,
        purpose: "export"
      });

      downloadSecretEnvFile(environment, localSecrets, localImportedSecrets);
    } catch (err) {
      if (err instanceof AxiosError) {
        const error = err?.response?.data as TApiErrors;

        if (error?.error === ApiErrorTypes.ForbiddenError && error.message.includes("readValue")) {
          createNotification({
            title: "You don't have permission to download secrets",
            text: "You don't have permission to view one or more of the secrets in the current folder. Please contact your administrator.",
            type: "error"
          });
          return;
        }
      }
      createNotification({
        title: "Failed to download secrets",
        text: "Please try again later.",
        type: "error"
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger>
        <UnstableIconButton
          variant="outline"
          size="md"
          isDisabled={environments.length !== 1 || isExportDisabled}
          onClick={handleSecretDownload}
          isPending={isDownloading}
        >
          <DownloadIcon />
        </UnstableIconButton>
      </TooltipTrigger>
      <TooltipContent>
        {(() => {
          if (isExportDisabled) return "Secret export is disabled for this environment";
          if (environments.length !== 1) return "Select a single environment to download secrets";
          return "Download secrets";
        })()}
      </TooltipContent>
    </Tooltip>
  );
};
