import { useState } from "react";
import { AxiosError } from "axios";
import { CopyIcon, DownloadIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  downloadTxtFile,
  formatSecretEnvFile,
  getSecretEnvFileEntryCount
} from "@app/helpers/download";
import {
  fetchProjectSecrets,
  useGetProjectSecretsExportPreflight
} from "@app/hooks/api/secrets/queries";
import { ApiErrorTypes, ProjectEnv, TApiErrors } from "@app/hooks/api/types";

type Props = {
  secretPath: string;
  environments: ProjectEnv[];
  projectId: string;
};

type ExportAction = "clipboard" | "download";

export const DownloadEnvButton = ({ environments, projectId, secretPath }: Props) => {
  const [pendingAction, setPendingAction] = useState<ExportAction>();
  const environment = environments.length === 1 ? environments[0].slug : "";
  const {
    data: preflightData,
    isError: isPreflightError,
    isLoading: isPreflightLoading
  } = useGetProjectSecretsExportPreflight({ projectId, environment, secretPath });
  const secretCount = preflightData
    ? getSecretEnvFileEntryCount(preflightData.secrets, preflightData.imports)
    : 0;
  const hasDownloadableSecrets = secretCount > 0;
  const isExporting = Boolean(pendingAction);
  const isEmpty = !isPreflightLoading && !isPreflightError && !hasDownloadableSecrets;
  const isDisabled = environments.length !== 1 || isPreflightLoading || isEmpty;

  let tooltipContent = "Export secrets";
  if (environments.length !== 1) {
    tooltipContent = "Select a single environment to export secrets";
  } else if (isPreflightLoading) {
    tooltipContent = "Checking for secrets";
  } else if (isEmpty) {
    tooltipContent = "No secrets in this folder";
  }

  const handleSecretExport = async (action: ExportAction) => {
    if (!environment) return;

    setPendingAction(action);
    try {
      const { secrets: localSecrets, imports: localImportedSecrets } = await fetchProjectSecrets({
        projectId,
        expandSecretReferences: true,
        includeImports: true,
        environment,
        secretPath
      });

      const file = formatSecretEnvFile(localSecrets, localImportedSecrets);
      if (!file) {
        createNotification({
          title: "No secrets in this folder",
          text: "There are no secrets to export.",
          type: "info"
        });
        return;
      }

      if (action === "clipboard") {
        await navigator.clipboard.writeText(file);
        createNotification({
          title: "Secrets copied to clipboard",
          text: "The secrets are ready to paste.",
          type: "success"
        });
      } else {
        downloadTxtFile(`${environment}.env`, file);
      }
    } catch (err) {
      if (err instanceof AxiosError) {
        const error = err?.response?.data as TApiErrors;

        if (error?.error === ApiErrorTypes.ForbiddenError && error.message.includes("readValue")) {
          createNotification({
            title: "You don't have permission to export secrets",
            text: "You don't have permission to view one or more of the secrets in the current folder. Please contact your administrator.",
            type: "error"
          });
          return;
        }
      }
      createNotification({
        title: "Failed to export secrets",
        text: "Please try again later.",
        type: "error"
      });
    } finally {
      setPendingAction(undefined);
    }
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <DropdownMenuTrigger asChild>
              <IconButton
                aria-label="Export secrets"
                variant="outline"
                size="md"
                isDisabled={isDisabled}
                isPending={isExporting || isPreflightLoading}
              >
                <DownloadIcon />
              </IconButton>
            </DropdownMenuTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltipContent}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {preflightData && (
          <DropdownMenuLabel>
            {secretCount} {secretCount === 1 ? "secret" : "secrets"}
          </DropdownMenuLabel>
        )}
        <DropdownMenuItem onClick={() => handleSecretExport("clipboard")}>
          <CopyIcon />
          Copy to clipboard
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSecretExport("download")}>
          <DownloadIcon />
          Download as .env
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
