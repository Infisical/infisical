import {
  ChevronDown,
  ChevronsLeftRightEllipsisIcon,
  FingerprintIcon,
  FolderIcon,
  HexagonIcon,
  ImportIcon,
  KeyIcon,
  ListPlusIcon,
  PlusIcon,
  RefreshCwIcon,
  UploadIcon
} from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import {
  ProjectPermissionProxiedServiceActions,
  ProjectPermissionSecretSyncActions
} from "@app/context/ProjectPermissionContext/types";

export type AddResourceButtonsProps = {
  onAddSecret: () => void;
  onAddFolder: () => void;
  onAddDyanamicSecret: () => void;
  onAddSecretRotation: () => void;
  onAddHoneyToken: () => void;
  onAddProxiedService: () => void;
  onAddSecretImport: () => void;
  onAddSecretSync: () => void;
  onImportSecrets: () => void;
  onImportFromVault: () => void;
  onImportFromDoppler: () => void;
  isDyanmicSecretAvailable: boolean;
  isSecretRotationAvailable: boolean;
  isHoneyTokenAvailable: boolean;
  isSecretImportAvailable: boolean;
  isSingleEnvSelected: boolean;
  hasVaultConnection: boolean;
  hasDopplerConnection: boolean;
  isDisabled?: boolean;
  variant?: "toolbar" | "object-type";
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
  onAddSecretSync,
  onImportSecrets,
  onImportFromVault,
  onImportFromDoppler,
  isDyanmicSecretAvailable,
  isSecretRotationAvailable,
  isHoneyTokenAvailable,
  isSecretImportAvailable,
  isSingleEnvSelected,
  hasVaultConnection,
  hasDopplerConnection,
  isDisabled,
  variant = "toolbar",
  canCreateSecrets,
  canCreateFolders,
  canCreateHoneyTokens
}: AddResourceButtonsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "object-type" ? (
          <IconButton
            aria-label={isDisabled ? "Secret draft in progress" : "Add another resource type"}
            className="mx-auto border-0 [&>svg]:!size-4"
            isDisabled={isDisabled}
            size="2xs"
            variant="ghost-muted"
          >
            {isDisabled ? <KeyIcon className="text-secret" /> : <PlusIcon />}
          </IconButton>
        ) : (
          <Button variant="project">
            <ChevronDown />
            Add New
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={variant === "object-type" ? "start" : "end"} className="w-56 p-1">
        <Tooltip open={!canCreateSecrets ? undefined : false}>
          <TooltipTrigger asChild>
            <DropdownMenuItem
              className="px-2 py-1.5"
              onClick={onAddSecret}
              isDisabled={!canCreateSecrets}
            >
              <KeyIcon className="text-secret" />
              Add Secret
            </DropdownMenuItem>
          </TooltipTrigger>
          <TooltipContent side="left">Access Restricted</TooltipContent>
        </Tooltip>
        <Tooltip open={!canCreateFolders ? undefined : false}>
          <TooltipTrigger asChild>
            <DropdownMenuItem
              className="px-2 py-1.5"
              onClick={onAddFolder}
              isDisabled={!canCreateFolders}
            >
              <FolderIcon className="text-folder" />
              Add Folder
            </DropdownMenuItem>
          </TooltipTrigger>
          <TooltipContent side="left">Access Restricted</TooltipContent>
        </Tooltip>
        <Tooltip open={!isDyanmicSecretAvailable ? undefined : false}>
          <TooltipTrigger asChild>
            <DropdownMenuItem
              className="px-2 py-1.5"
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
          <TooltipTrigger asChild>
            <DropdownMenuItem
              className="px-2 py-1.5"
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
          <TooltipTrigger asChild>
            <DropdownMenuItem
              className="px-2 py-1.5"
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
              <TooltipTrigger asChild>
                <DropdownMenuItem
                  className="px-2 py-1.5"
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
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="px-2 py-1.5">
            <ListPlusIcon />
            Add more
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56 p-1" sideOffset={0}>
            <Tooltip open={!isSecretImportAvailable || !isSingleEnvSelected ? undefined : false}>
              <TooltipTrigger asChild>
                <DropdownMenuItem
                  className="px-2 py-1.5"
                  onClick={onAddSecretImport}
                  isDisabled={!isSecretImportAvailable || !isSingleEnvSelected}
                >
                  <ImportIcon className="text-import" />
                  Add Secret Import
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent side="left">
                {!isSecretImportAvailable
                  ? "Access Restricted"
                  : "Select a single environment to add a secret import"}
              </TooltipContent>
            </Tooltip>
            <Tooltip open={!canCreateSecrets ? undefined : false}>
              <TooltipTrigger asChild>
                <DropdownMenuItem
                  className="px-2 py-1.5"
                  onClick={onImportSecrets}
                  isDisabled={!canCreateSecrets}
                >
                  <UploadIcon className="text-accent" />
                  Upload Secrets
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent side="left">Access Restricted</TooltipContent>
            </Tooltip>
            <ProjectPermissionCan
              I={ProjectPermissionSecretSyncActions.Create}
              a={ProjectPermissionSub.SecretSyncs}
            >
              {(isAllowed) => (
                <Tooltip open={!isAllowed ? undefined : false}>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      className="px-2 py-1.5"
                      onClick={onAddSecretSync}
                      isDisabled={!isAllowed}
                    >
                      <RefreshCwIcon className="text-accent" />
                      Add Secret Sync
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="left">Access Restricted</TooltipContent>
                </Tooltip>
              )}
            </ProjectPermissionCan>
            {(hasVaultConnection || hasDopplerConnection) && <DropdownMenuSeparator />}
            {hasVaultConnection && (
              <Tooltip open={!canCreateSecrets || !isSingleEnvSelected ? undefined : false}>
                <TooltipTrigger asChild>
                  <DropdownMenuItem
                    className="px-2 py-1.5"
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
                <TooltipTrigger asChild>
                  <DropdownMenuItem
                    className="px-2 py-1.5"
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
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
