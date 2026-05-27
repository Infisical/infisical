import { useState } from "react";
import { AxiosError } from "axios";
import { DownloadIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { IconButton, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { downloadSecretAppSettingsJsonFile, downloadSecretEnvFile } from "@app/helpers/download";
import { fetchProjectSecrets } from "@app/hooks/api/secrets/queries";
import { ApiErrorTypes, ProjectEnv, TApiErrors } from "@app/hooks/api/types";

type Props = {
  secretPath: string;
  environments: ProjectEnv[];
  projectId: string;
};

export const DownloadEnvButton = ({ environments, projectId, secretPath }: Props) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleSecretDownload = async () => {
    if (environments.length !== 1) return;

    const environment = environments[0].slug;
    const format = typeof window !== "undefined" ? localStorage.getItem(`infisical-secret-download-format-${projectId}`) || "env" : "env";

    setIsDownloading(true);
    try {
      const { secrets: localSecrets, imports: localImportedSecrets } = await fetchProjectSecrets({
        projectId,
        expandSecretReferences: true,
        includeImports: true,
        environment,
        secretPath
      });

      if (format === "appsettings") {
        downloadSecretAppSettingsJsonFile(environment, localSecrets, localImportedSecrets);
      } else {
        downloadSecretEnvFile(environment, localSecrets, localImportedSecrets);
      }
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

  const currentFormat = typeof window !== "undefined" ? localStorage.getItem(`infisical-secret-download-format-${projectId}`) || "env" : "env";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          variant="outline"
          size="md"
          isDisabled={environments.length !== 1}
          onClick={handleSecretDownload}
          isPending={isDownloading}
        >
          <DownloadIcon />
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>
        {environments.length !== 1
          ? "Select a single environment to download secrets"
          : `Download secrets (${currentFormat === "appsettings" ? "appsettings.json" : ".env"})`}
      </TooltipContent>
    </Tooltip>
  );
};
