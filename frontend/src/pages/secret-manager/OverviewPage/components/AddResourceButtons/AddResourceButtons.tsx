import type { ReactNode } from "react";
import {
  ChevronDown,
  ChevronsLeftRightEllipsisIcon,
  ClipboardPasteIcon,
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
  DropdownMenuLabel,
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

type MenuItemTooltipProps = {
  children: ReactNode;
  content: ReactNode;
  isDisabled: boolean;
};

function MenuItemTooltip({ children, content, isDisabled }: MenuItemTooltipProps) {
  return (
    <Tooltip open={isDisabled ? undefined : false}>
      {isDisabled ? (
        <TooltipTrigger className="block w-full">{children}</TooltipTrigger>
      ) : (
        <TooltipTrigger asChild>{children}</TooltipTrigger>
      )}
      <TooltipContent side="left">{content}</TooltipContent>
    </Tooltip>
  );
}

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
  onCopySecrets: () => void;
  canCopySecrets: boolean;
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
  onCopySecrets,
  canCopySecrets,
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
        <DropdownMenuLabel>Basic</DropdownMenuLabel>
        <MenuItemTooltip isDisabled={!canCreateSecrets} content="Access Restricted">
          <DropdownMenuItem
            className="px-2 py-1.5"
            onClick={onAddSecret}
            isDisabled={!canCreateSecrets}
          >
            <KeyIcon className="text-secret" />
            Add Secret
          </DropdownMenuItem>
        </MenuItemTooltip>
        <MenuItemTooltip isDisabled={!canCreateSecrets} content="Access Restricted">
          <DropdownMenuItem
            className="px-2 py-1.5"
            onClick={onImportSecrets}
            isDisabled={!canCreateSecrets}
          >
            <UploadIcon className="text-accent" />
            Upload Secrets
          </DropdownMenuItem>
        </MenuItemTooltip>
        <MenuItemTooltip isDisabled={!canCreateFolders} content="Access Restricted">
          <DropdownMenuItem
            className="px-2 py-1.5"
            onClick={onAddFolder}
            isDisabled={!canCreateFolders}
          >
            <FolderIcon className="text-folder" />
            Add Folder
          </DropdownMenuItem>
        </MenuItemTooltip>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Advanced</DropdownMenuLabel>
        <MenuItemTooltip isDisabled={!isDyanmicSecretAvailable} content="Access Restricted">
          <DropdownMenuItem
            className="px-2 py-1.5"
            onClick={onAddDyanamicSecret}
            isDisabled={!isDyanmicSecretAvailable}
          >
            <FingerprintIcon className="text-dynamic-secret" />
            Add Dynamic Secret
          </DropdownMenuItem>
        </MenuItemTooltip>
        <MenuItemTooltip isDisabled={!isSecretRotationAvailable} content="Access Restricted">
          <DropdownMenuItem
            className="px-2 py-1.5"
            onClick={onAddSecretRotation}
            isDisabled={!isSecretRotationAvailable}
          >
            <RefreshCwIcon className="text-secret-rotation" />
            Add Secret Rotation
          </DropdownMenuItem>
        </MenuItemTooltip>
        <MenuItemTooltip
          isDisabled={!isHoneyTokenAvailable || !canCreateHoneyTokens}
          content="Access Restricted"
        >
          <DropdownMenuItem
            className="px-2 py-1.5"
            onClick={onAddHoneyToken}
            isDisabled={!isHoneyTokenAvailable || !canCreateHoneyTokens}
          >
            <HexagonIcon className="text-warning" />
            Add Honey Token
          </DropdownMenuItem>
        </MenuItemTooltip>
        <ProjectPermissionCan
          I={ProjectPermissionProxiedServiceActions.Create}
          a={ProjectPermissionSub.ProxiedServices}
        >
          {(isAllowed) => (
            <MenuItemTooltip
              isDisabled={!isSingleEnvSelected || !isAllowed}
              content={
                !isAllowed
                  ? "Access Restricted"
                  : "Select a single environment to add a proxied service"
              }
            >
              <DropdownMenuItem
                className="px-2 py-1.5"
                onClick={onAddProxiedService}
                isDisabled={!isSingleEnvSelected || !isAllowed}
              >
                <ChevronsLeftRightEllipsisIcon className="text-proxied-service" />
                Add Proxied Service
              </DropdownMenuItem>
            </MenuItemTooltip>
          )}
        </ProjectPermissionCan>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="px-2 py-1.5">
            <ListPlusIcon />
            Add more
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 p-1" sideOffset={0}>
            <MenuItemTooltip
              isDisabled={!isSecretImportAvailable || !isSingleEnvSelected}
              content={
                !isSecretImportAvailable
                  ? "Access Restricted"
                  : "Select a single environment to add a secret import"
              }
            >
              <DropdownMenuItem
                className="px-2 py-1.5"
                onSelect={onAddSecretImport}
                isDisabled={!isSecretImportAvailable || !isSingleEnvSelected}
              >
                <ImportIcon className="text-import" />
                Add Secret Import
              </DropdownMenuItem>
            </MenuItemTooltip>
            <MenuItemTooltip
              isDisabled={isCopySecretsDisabled || !canCopySecrets}
              content={
                !canCopySecrets
                  ? "Access Restricted"
                  : (copySecretsDisabledReason ?? "Copy secrets is unavailable")
              }
            >
              <DropdownMenuItem
                className="px-2 py-1.5"
                onSelect={onCopySecrets}
                isDisabled={isCopySecretsDisabled || !canCopySecrets}
              >
                <ClipboardPasteIcon className="text-accent" />
                Copy from Other Environment
              </DropdownMenuItem>
            </MenuItemTooltip>
            <ProjectPermissionCan
              I={ProjectPermissionSecretSyncActions.Create}
              a={ProjectPermissionSub.SecretSyncs}
            >
              {(isAllowed) => (
                <MenuItemTooltip isDisabled={!isAllowed} content="Access Restricted">
                  <DropdownMenuItem
                    className="px-2 py-1.5"
                    onSelect={onAddSecretSync}
                    isDisabled={!isAllowed}
                  >
                    <RefreshCwIcon className="text-accent" />
                    Add Secret Sync
                  </DropdownMenuItem>
                </MenuItemTooltip>
              )}
            </ProjectPermissionCan>
            {(hasVaultConnection || hasDopplerConnection) && <DropdownMenuSeparator />}
            {hasVaultConnection && (
              <MenuItemTooltip
                isDisabled={!canCreateSecrets || !isSingleEnvSelected}
                content={
                  isSingleEnvSelected
                    ? "Access Restricted"
                    : "Select a single environment to import from Vault"
                }
              >
                <DropdownMenuItem
                  className="px-2 py-1.5"
                  onSelect={onImportFromVault}
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
              </MenuItemTooltip>
            )}
            {hasDopplerConnection && (
              <MenuItemTooltip
                isDisabled={!canCreateSecrets || !isSingleEnvSelected}
                content={
                  isSingleEnvSelected
                    ? "Access Restricted"
                    : "Select a single environment to import from Doppler"
                }
              >
                <DropdownMenuItem
                  className="px-2 py-1.5"
                  onSelect={onImportFromDoppler}
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
              </MenuItemTooltip>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
