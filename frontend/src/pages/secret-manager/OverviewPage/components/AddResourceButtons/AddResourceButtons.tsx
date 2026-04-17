import {
  ChevronDown,
  ClipboardPasteIcon,
  FingerprintIcon,
  FolderIcon,
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
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

type Props = {
  onAddSecret: () => void;
  onAddFolder: () => void;
  onAddDyanamicSecret: () => void;
  onAddSecretRotation: () => void;
  onAddSecretImport: () => void;
  onImportSecrets: () => void;
  onReplicateSecrets: () => void;
  onImportFromVault: () => void;
  isDyanmicSecretAvailable: boolean;
  isSecretRotationAvailable: boolean;
  isReplicateSecretsAvailable: boolean;
  isSecretImportAvailable: boolean;
  isSingleEnvSelected: boolean;
  hasVaultConnection: boolean;
  isOrgAdmin: boolean;
};

export function AddResourceButtons({
  onAddSecret,
  onAddFolder,
  onAddDyanamicSecret,
  onAddSecretRotation,
  onAddSecretImport,
  onImportSecrets,
  onReplicateSecrets,
  onImportFromVault,
  isDyanmicSecretAvailable,
  isSecretRotationAvailable,
  isReplicateSecretsAvailable,
  isSecretImportAvailable,
  isSingleEnvSelected,
  hasVaultConnection,
  isOrgAdmin
}: Props) {
  return (
    <ButtonGroup>
      <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Secrets}>
        {(isAllowed) => (
          <Tooltip open={!isAllowed ? undefined : false}>
            <TooltipTrigger>
              <Button
                className="rounded-r-none"
                isDisabled={!isAllowed}
                variant="project"
                onClick={onAddSecret}
              >
                <PlusIcon />
                Add Secret
              </Button>
            </TooltipTrigger>
            <TooltipContent>Access Denied</TooltipContent>
          </Tooltip>
        )}
      </ProjectPermissionCan>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton variant="project">
            <ChevronDown />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.SecretFolders}
          >
            {(isAllowed) => (
              <Tooltip open={!isAllowed ? undefined : false}>
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem onClick={onAddFolder} isDisabled={!isAllowed}>
                    <FolderIcon className="text-folder" />
                    Add Folder
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">Access Restricted</TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
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
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.Secrets}
          >
            {(isAllowed) => (
              <Tooltip open={!isAllowed ? undefined : false}>
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem onClick={onImportSecrets} isDisabled={!isAllowed}>
                    <UploadIcon className="text-accent" />
                    Upload Secrets
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">Access Restricted</TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.SecretFolders}
          >
            {(isAllowed) => (
              <Tooltip open={!isReplicateSecretsAvailable || !isAllowed ? undefined : false}>
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem
                    onClick={onReplicateSecrets}
                    isDisabled={!isReplicateSecretsAvailable || !isAllowed}
                  >
                    <ClipboardPasteIcon className="text-accent" />
                    Replicate Secrets
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {!isReplicateSecretsAvailable
                    ? "Select a single environment to replicate secrets"
                    : "Access Denied"}
                </TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
          {hasVaultConnection && (
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={ProjectPermissionSub.Secrets}
            >
              {(isAllowed) => (
                <Tooltip
                  open={!isAllowed || !isOrgAdmin || !isSingleEnvSelected ? undefined : false}
                >
                  <TooltipTrigger className="block w-full">
                    <DropdownMenuItem
                      onClick={onImportFromVault}
                      isDisabled={!isAllowed || !isOrgAdmin || !isSingleEnvSelected}
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
                    {/* eslint-disable-next-line no-nested-ternary */}
                    {!isOrgAdmin
                      ? "Only organization admins can import secrets from HashiCorp Vault"
                      : !isSingleEnvSelected
                        ? "Select a single environment to import from HashiCorp Vault"
                        : "Access Restricted"}
                  </TooltipContent>
                </Tooltip>
              )}
            </ProjectPermissionCan>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
