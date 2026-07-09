import {
  ArrowRightLeftIcon,
  ChevronDown,
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
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
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
  onReplicateSecrets: () => void;
  onImportFromVault: () => void;
  onImportFromDoppler: () => void;
  isDyanmicSecretAvailable: boolean;
  isSecretRotationAvailable: boolean;
  isHoneyTokenAvailable: boolean;
  isReplicateSecretsAvailable: boolean;
  isSecretImportAvailable: boolean;
  isSingleEnvSelected: boolean;
  hasVaultConnection: boolean;
  hasDopplerConnection: boolean;
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
  onReplicateSecrets,
  onImportFromVault,
  onImportFromDoppler,
  isDyanmicSecretAvailable,
  isSecretRotationAvailable,
  isHoneyTokenAvailable,
  isReplicateSecretsAvailable,
  isSecretImportAvailable,
  isSingleEnvSelected,
  hasVaultConnection,
  hasDopplerConnection
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
          <DropdownMenuLabel>New</DropdownMenuLabel>
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
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.HoneyTokens}
          >
            {(isAllowed) => (
              <Tooltip open={!isHoneyTokenAvailable || !isAllowed ? undefined : false}>
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem
                    onClick={onAddHoneyToken}
                    isDisabled={!isHoneyTokenAvailable || !isAllowed}
                  >
                    <HexagonIcon className="text-yellow" />
                    Add Honey Token
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {!isAllowed ? "Access Restricted" : "Access restricted"}
                </TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
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
                    <ArrowRightLeftIcon className="text-proxied-service" />
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
          {(hasVaultConnection || hasDopplerConnection) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>IMPORT FROM</DropdownMenuLabel>
            </>
          )}
          {hasVaultConnection && (
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={ProjectPermissionSub.Secrets}
            >
              {(isAllowed) => {
                let vaultImportTooltip: string;
                if (!hasVaultConnection) {
                  vaultImportTooltip = "No HashiCorp Vault connection found";
                } else if (!isSingleEnvSelected) {
                  vaultImportTooltip = "Select a single environment to import from Vault";
                } else {
                  vaultImportTooltip = "Access Restricted";
                }

                return (
                  <Tooltip
                    open={
                      !isAllowed || !isSingleEnvSelected || !hasVaultConnection ? undefined : false
                    }
                  >
                    <TooltipTrigger className="block w-full">
                      <DropdownMenuItem
                        onClick={onImportFromVault}
                        isDisabled={!isAllowed || !isSingleEnvSelected || !hasVaultConnection}
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
                    <TooltipContent side="left">{vaultImportTooltip}</TooltipContent>
                  </Tooltip>
                );
              }}
            </ProjectPermissionCan>
          )}
          {hasDopplerConnection && (
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={ProjectPermissionSub.Secrets}
            >
              {(isAllowed) => {
                let dopplerImportTooltip: string;
                if (!hasDopplerConnection) {
                  dopplerImportTooltip = "No Doppler connection found";
                } else if (!isSingleEnvSelected) {
                  dopplerImportTooltip = "Select a single environment to import from Doppler";
                } else {
                  dopplerImportTooltip = "Access Restricted";
                }

                return (
                  <Tooltip
                    open={
                      !isAllowed || !isSingleEnvSelected || !hasDopplerConnection
                        ? undefined
                        : false
                    }
                  >
                    <TooltipTrigger className="block w-full">
                      <DropdownMenuItem
                        onClick={onImportFromDoppler}
                        isDisabled={!isAllowed || !isSingleEnvSelected || !hasDopplerConnection}
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
                    <TooltipContent side="left">{dopplerImportTooltip}</TooltipContent>
                  </Tooltip>
                );
              }}
            </ProjectPermissionCan>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
