import { cloneElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
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
import { ProjectPermissionProxiedServiceActions } from "@app/context/ProjectPermissionContext/types";
import type {
  SecretsAddResourceAction,
  SecretsAddResourceMenuLevel,
  SecretsAddResourceMenuSource
} from "@app/lib/analytics";

type MenuItemTooltipProps = {
  children: ReactElement<ComponentProps<typeof DropdownMenuItem>>;
  content: ReactNode;
  isDisabled: boolean;
};

function MenuItemTooltip({ children, content, isDisabled }: MenuItemTooltipProps) {
  const trigger = isDisabled
    ? cloneElement(children, {
        isDisabled: true,
        isDisabledFocusable: true
      })
    : children;

  return (
    <Tooltip open={isDisabled ? undefined : false}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="left">{content}</TooltipContent>
    </Tooltip>
  );
}

export type AddResourceButtonsProps = {
  onMenuOpen: (
    source: SecretsAddResourceMenuSource,
    menuLevel: SecretsAddResourceMenuLevel
  ) => void;
  onActionSelect: (action: SecretsAddResourceAction, source: SecretsAddResourceMenuSource) => void;
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
  canCreateSecretSyncs: boolean;
};

export function AddResourceButtons({
  onMenuOpen,
  onActionSelect,
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
  canCreateHoneyTokens,
  canCreateSecretSyncs
}: AddResourceButtonsProps) {
  const selectAction = (action: SecretsAddResourceAction, callback: () => void) => () => {
    onActionSelect(action, variant);
    callback();
  };

  return (
    <DropdownMenu onOpenChange={(isOpen) => isOpen && onMenuOpen(variant, "root")}>
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
      <DropdownMenuContent align={variant === "object-type" ? "start" : "end"}>
        <DropdownMenuLabel>Basic</DropdownMenuLabel>
        {variant === "toolbar" && (
          <MenuItemTooltip isDisabled={!canCreateSecrets} content="Access Restricted">
            <DropdownMenuItem
              onClick={selectAction("secret", onAddSecret)}
              isDisabled={!canCreateSecrets}
            >
              <KeyIcon className="text-secret" />
              Add Secret
            </DropdownMenuItem>
          </MenuItemTooltip>
        )}
        <MenuItemTooltip isDisabled={!canCreateSecrets} content="Access Restricted">
          <DropdownMenuItem
            onClick={selectAction("upload-secrets", onImportSecrets)}
            isDisabled={!canCreateSecrets}
          >
            <UploadIcon className="text-accent" />
            Upload Secrets
          </DropdownMenuItem>
        </MenuItemTooltip>
        <MenuItemTooltip isDisabled={!canCreateFolders} content="Access Restricted">
          <DropdownMenuItem
            onClick={selectAction("folder", onAddFolder)}
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
            onClick={selectAction("dynamic-secret", onAddDyanamicSecret)}
            isDisabled={!isDyanmicSecretAvailable}
          >
            <FingerprintIcon className="text-dynamic-secret" />
            Add Dynamic Secret
          </DropdownMenuItem>
        </MenuItemTooltip>
        <MenuItemTooltip isDisabled={!isSecretRotationAvailable} content="Access Restricted">
          <DropdownMenuItem
            onClick={selectAction("secret-rotation", onAddSecretRotation)}
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
            onClick={selectAction("honey-token", onAddHoneyToken)}
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
                onClick={selectAction("proxied-service", onAddProxiedService)}
                isDisabled={!isSingleEnvSelected || !isAllowed}
              >
                <ChevronsLeftRightEllipsisIcon className="text-proxied-service" />
                Add Proxied Service
              </DropdownMenuItem>
            </MenuItemTooltip>
          )}
        </ProjectPermissionCan>
        <DropdownMenuSub onOpenChange={(isOpen) => isOpen && onMenuOpen(variant, "more")}>
          <DropdownMenuSubTrigger>
            <ListPlusIcon />
            Add More
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <MenuItemTooltip
              isDisabled={!isSecretImportAvailable || !isSingleEnvSelected}
              content={
                !isSecretImportAvailable
                  ? "Access Restricted"
                  : "Select a single environment to add a secret import"
              }
            >
              <DropdownMenuItem
                onSelect={selectAction("secret-import", onAddSecretImport)}
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
                onSelect={selectAction("copy-secrets", onCopySecrets)}
                isDisabled={isCopySecretsDisabled || !canCopySecrets}
              >
                <ClipboardPasteIcon className="text-accent" />
                Copy Secrets
              </DropdownMenuItem>
            </MenuItemTooltip>
            <MenuItemTooltip
              isDisabled={!canCreateSecretSyncs || !isSingleEnvSelected}
              content={
                !canCreateSecretSyncs
                  ? "Access Restricted"
                  : "Select a single environment to add a secret sync"
              }
            >
              <DropdownMenuItem
                onSelect={selectAction("secret-sync", onAddSecretSync)}
                isDisabled={!canCreateSecretSyncs || !isSingleEnvSelected}
              >
                <RefreshCwIcon className="text-accent" />
                Add Secret Sync
              </DropdownMenuItem>
            </MenuItemTooltip>
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
                  onSelect={selectAction("import-from-vault", onImportFromVault)}
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
                  onSelect={selectAction("import-from-doppler", onImportFromDoppler)}
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
