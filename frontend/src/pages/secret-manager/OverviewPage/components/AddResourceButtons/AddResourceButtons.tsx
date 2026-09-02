import {
  ChevronDown,
  ChevronsLeftRightEllipsisIcon,
  ClipboardPasteIcon,
  FingerprintIcon,
  FolderIcon,
  HexagonIcon,
  ImportIcon,
  PlusIcon,
  RefreshCwIcon,
  UploadIcon
} from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  ButtonGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionProxiedServiceActions } from "@app/context/ProjectPermissionContext/types";

type Props = {
  onAddSecret: () => void;
  onAddFolder: () => void;
  onAddDyanamicSecret: () => void;
  onAddSecretRotation: () => void;
  onAddHoneyToken: () => void;
  onAddProxiedService: () => void;
  onAddSecretImport: () => void;
  onImportSecrets: () => void;
  onCopySecrets: () => void;
  isCopySecretsDisabled: boolean;
  copySecretsDisabledReason?: string;
  onImportFromVault: () => void;
  onImportFromDoppler: () => void;
  isDyanmicSecretAvailable: boolean;
  isSecretRotationAvailable: boolean;
  isHoneyTokenAvailable: boolean;
  isSecretImportAvailable: boolean;
  isSingleEnvSelected: boolean;
  hasVaultConnection: boolean;
  hasDopplerConnection: boolean;
  canCreateSecrets: boolean;
  canCreateFolders: boolean;
  canCreateHoneyTokens: boolean;
};

export function AddResourceButtons({
  onAddSecret,
  onAddFolder,
  onAddDyanamicSecret,
  onAddSecretRotation,
  onAddHoneyToken,
  onAddProxiedService,
  onAddSecretImport,
  onImportSecrets,
  onCopySecrets,
  isCopySecretsDisabled,
  copySecretsDisabledReason,
  onImportFromVault,
  onImportFromDoppler,
  isDyanmicSecretAvailable,
  isSecretRotationAvailable,
  isHoneyTokenAvailable,
  isSecretImportAvailable,
  isSingleEnvSelected,
  hasVaultConnection,
  hasDopplerConnection,
  canCreateSecrets,
  canCreateFolders,
  canCreateHoneyTokens
}: Props) {
  return (
    <ButtonGroup>
      <Tooltip open={!canCreateSecrets ? undefined : false}>
        <TooltipTrigger>
          <Button
            className="rounded-r-none"
            isDisabled={!canCreateSecrets}
            variant="project"
            onClick={onAddSecret}
          >
            <PlusIcon />
            Add Secret
          </Button>
        </TooltipTrigger>
        <TooltipContent>Access Denied</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton variant="project">
            <ChevronDown />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>New</DropdownMenuLabel>
          <Tooltip open={!canCreateFolders ? undefined : false}>
            <TooltipTrigger className="block w-full">
              <DropdownMenuItem onClick={onAddFolder} isDisabled={!canCreateFolders}>
                <FolderIcon className="text-folder" />
                Add Folder
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left">Access Restricted</TooltipContent>
          </Tooltip>
          <Tooltip open={!isDyanmicSecretAvailable ? undefined : false}>
            <TooltipTrigger className="block w-full">
              <DropdownMenuItem
                onClick={onAddDyanamicSecret}
                isDisabled={!isDyanmicSecretAvailable}
              >
                <FingerprintIcon className="text-dynamic-secret" />
                Add Dynamic Secret
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left">Access restricted</TooltipContent>
          </Tooltip>
          <Tooltip open={!isSecretRotationAvailable ? undefined : false}>
            <TooltipTrigger className="block w-full">
              <DropdownMenuItem
                onClick={onAddSecretRotation}
                isDisabled={!isSecretRotationAvailable}
              >
                <RefreshCwIcon className="text-secret-rotation" />
                Add Secret Rotation
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left">Access restricted</TooltipContent>
          </Tooltip>
          <Tooltip open={!isHoneyTokenAvailable || !canCreateHoneyTokens ? undefined : false}>
            <TooltipTrigger className="block w-full">
              <DropdownMenuItem
                onClick={onAddHoneyToken}
                isDisabled={!isHoneyTokenAvailable || !canCreateHoneyTokens}
              >
                <HexagonIcon className="text-warning" />
                Add Honey Token
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left">Access restricted</TooltipContent>
          </Tooltip>
          <ProjectPermissionCan
            I={ProjectPermissionProxiedServiceActions.Create}
            a={ProjectPermissionSub.ProxiedServices}
          >
            {(isAllowed) => (
              <Tooltip open={!isSingleEnvSelected || !isAllowed ? undefined : false}>
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem
                    onClick={onAddProxiedService}
                    isDisabled={!isSingleEnvSelected || !isAllowed}
                  >
                    <ChevronsLeftRightEllipsisIcon className="text-proxied-service" />
                    Add Proxied Service
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {!isAllowed
                    ? "Access Restricted"
                    : "Select a single environment to add a proxied service"}
                </TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Bulk</DropdownMenuLabel>
          <Tooltip open={!isSecretImportAvailable || !isSingleEnvSelected ? undefined : false}>
            <TooltipTrigger className="block w-full">
              <DropdownMenuItem
                onClick={onAddSecretImport}
                isDisabled={!isSecretImportAvailable || !isSingleEnvSelected}
              >
                <ImportIcon className="text-import" />
                Add Secret Import
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left">
              {!isSecretImportAvailable
                ? "Access restricted"
                : "Select a single environment to add a secret import"}
            </TooltipContent>
          </Tooltip>
          <Tooltip open={!canCreateSecrets ? undefined : false}>
            <TooltipTrigger className="block w-full">
              <DropdownMenuItem onClick={onImportSecrets} isDisabled={!canCreateSecrets}>
                <UploadIcon className="text-accent" />
                Upload Secrets
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left">Access Restricted</TooltipContent>
          </Tooltip>
          <Tooltip open={isCopySecretsDisabled ? undefined : false}>
            <TooltipTrigger className="block w-full">
              <DropdownMenuItem onClick={onCopySecrets} isDisabled={isCopySecretsDisabled}>
                <ClipboardPasteIcon className="text-accent" />
                Copy Secrets
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left">
              {copySecretsDisabledReason ?? "Copy secrets is unavailable"}
            </TooltipContent>
          </Tooltip>
          {(hasVaultConnection || hasDopplerConnection) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>IMPORT FROM</DropdownMenuLabel>
            </>
          )}
          {hasVaultConnection && (
            <Tooltip open={!canCreateSecrets || !isSingleEnvSelected ? undefined : false}>
              <TooltipTrigger className="block w-full">
                <DropdownMenuItem
                  onClick={onImportFromVault}
                  isDisabled={!canCreateSecrets || !isSingleEnvSelected}
                >
                  <div className="flex w-4.5 justify-center rounded-full bg-foreground/75">
                    <img
                      src="/images/integrations/Vault.png"
                      alt="HashiCorp Vault"
                      className="mt-0.5 h-4 w-4"
                    />
                  </div>
                  Add from HashiCorp Vault
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent side="left">
                {isSingleEnvSelected
                  ? "Access Restricted"
                  : "Select a single environment to import from Vault"}
              </TooltipContent>
            </Tooltip>
          )}
          {hasDopplerConnection && (
            <Tooltip open={!canCreateSecrets || !isSingleEnvSelected ? undefined : false}>
              <TooltipTrigger className="block w-full">
                <DropdownMenuItem
                  onClick={onImportFromDoppler}
                  isDisabled={!canCreateSecrets || !isSingleEnvSelected}
                >
                  <div className="flex w-4.5 justify-center rounded-full bg-foreground/75">
                    <img
                      src="/images/integrations/Doppler.png"
                      alt="Doppler"
                      className="mt-0.5 h-4 w-4"
                    />
                  </div>
                  Add from Doppler
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent side="left">
                {isSingleEnvSelected
                  ? "Access Restricted"
                  : "Select a single environment to import from Doppler"}
              </TooltipContent>
            </Tooltip>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
