import { useState } from "react";
import { subject } from "@casl/ability";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  BanIcon,
  ClockIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  HardDriveIcon,
  RotateCcwIcon,
  ServerCogIcon,
  UserIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Badge,
  EmptyMedia,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useGetSecretVersion, useUpdateSecretV3 } from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { fetchSecretVersionValue } from "@app/hooks/api/secrets/queries";
import { SecretType, SecretVersions } from "@app/hooks/api/types";

type Props = {
  secretId: string;
  secretKey: string;
  environment: string;
  secretPath: string;
  isRotatedSecret: boolean;
  canReadValue: boolean;
};

type VersionItemProps = {
  secretId: string;
  secretKey: string;
  environment: string;
  secretPath: string;
  version: SecretVersions;
  currentVersion: number;
  isRotatedSecret: boolean;
  canReadValue: boolean;
  onRestoreSuccess: () => void;
  isLast: boolean;
};

function VersionItem({
  secretId,
  secretKey,
  environment,
  secretPath,
  version,
  currentVersion,
  isRotatedSecret,
  canReadValue,
  onRestoreSuccess,
  isLast
}: VersionItemProps) {
  const { currentProject } = useProject();
  const { mutateAsync: updateSecret, isPending: isRestoring } = useUpdateSecretV3();

  const [secretValue, setSecretValue] = useState<string | null>(null);
  const [isValueVisible, setIsValueVisible] = useState(false);
  const [isFetchingValue, setIsFetchingValue] = useState(false);
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);

  const isCurrentVersion = version.version === currentVersion;
  const canRestore = !isRotatedSecret && canReadValue && !isCurrentVersion;

  const navigate = useNavigate();

  const getModifiedByName = (
    userType: string | undefined | null,
    userName: string | null | undefined
  ) => {
    switch (userType) {
      case ActorType.PLATFORM:
        return "System";
      case ActorType.IDENTITY:
        return userName || "Deleted Identity";
      case ActorType.USER:
        return userName || "Deleted User";
      default:
        return "Unknown";
    }
  };

  const handleFetchSecretValue = async () => {
    if (secretValue !== null) return secretValue;
    try {
      setIsFetchingValue(true);
      const value = await fetchSecretVersionValue(secretId, version.version);
      setSecretValue(value);
      return value;
    } catch (e) {
      console.error(e);
      createNotification({ type: "error", text: "Failed to fetch secret version value" });
      throw e;
    } finally {
      setIsFetchingValue(false);
    }
  };

  const getLinkToModifyHistoryEntity = (
    actorId: string,
    actorType: string,
    membershipId: string | null = "",
    groupId: string | null = "",
    actorName: string | null = ""
  ) => {
    switch (actorType) {
      case ActorType.USER:
        if (groupId)
          return `/projects/secret-management/${currentProject.id}/groups/${groupId}?username=${actorName}`;
        return `/projects/secret-management/${currentProject.id}/members/${membershipId}`;
      case ActorType.IDENTITY:
        return `/projects/secret-management/${currentProject.id}/identities/${actorId}`;
      default:
        return null;
    }
  };

  const handleViewActor = (
    actorId: string | undefined | null,
    actorType: string | undefined | null,
    membershipId: string | undefined | null,
    groupId: string | undefined | null,
    actorName: string | undefined | null
  ) => {
    if (!membershipId) {
      createNotification({
        type: "info",
        text: `This ${actorType === ActorType.USER ? "user" : "identity"} is no longer a member of this project.`
      });
      return;
    }

    if (actorType && actorId && actorType !== ActorType.PLATFORM) {
      const redirectLink = getLinkToModifyHistoryEntity(
        actorId,
        actorType,
        membershipId,
        groupId,
        actorName
      );
      if (redirectLink) {
        navigate({ to: redirectLink });
      }
    }
  };

  const handleToggleVisibility = async () => {
    if (!isValueVisible) {
      await handleFetchSecretValue();
    }
    setIsValueVisible(!isValueVisible);
  };

  const handleCopyValue = async () => {
    try {
      const value = await handleFetchSecretValue();
      await navigator.clipboard.writeText(value || "");
      createNotification({ type: "success", text: "Value copied to clipboard" });
    } catch {
      // Error notification already handled in handleFetchSecretValue
    }
  };

  const handleRestore = async () => {
    try {
      const value = await handleFetchSecretValue();

      const result = await updateSecret({
        projectId: currentProject.id,
        environment,
        secretPath,
        secretKey,
        secretValue: value,
        type: SecretType.Shared
      });

      if ("approval" in result) {
        createNotification({
          type: "info",
          text: "Requested change has been sent for review"
        });
      } else {
        createNotification({
          type: "success",
          text: `Secret restored to version ${version.version}`
        });
      }

      setIsRestoreDialogOpen(false);
      onRestoreSuccess();
    } catch (e) {
      console.error(e);
      createNotification({
        type: "error",
        text: "Failed to restore secret version"
      });
    }
  };

  return (
    <div className="relative flex gap-4">
      {/* Timeline indicator */}
      <div className="relative flex flex-col items-center">
        <div
          className={`absolute top-2 left-0 size-3 rounded-full border-2 ${
            isCurrentVersion ? "border-info/60 bg-info/10" : "border-border bg-transparent"
          }`}
        />
        {!isLast && <div className="absolute top-5 -bottom-2 left-[5.5px] w-px bg-border" />}
      </div>

      {/* Content */}
      <div className="flex-1 pb-6 pl-2">
        {/* Header row */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={twMerge(
                "text-sm font-semibold",
                isCurrentVersion ? "text-info" : "text-foreground"
              )}
            >
              v{version.version}
            </span>
            {isCurrentVersion && <Badge variant="info">Current</Badge>}
            <div className="flex items-center gap-1 text-xs text-muted">
              <ClockIcon className="size-3" />
              {format(new Date(version.createdAt), "MMM d, yyyy, h:mm a")}
            </div>
          </div>

          {/* Actions */}
          {canReadValue && !version.secretValueHidden && (
            <div className="flex items-center gap-1">
              <AlertDialog open={isRestoreDialogOpen} onOpenChange={setIsRestoreDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogMedia>
                      <RotateCcwIcon />
                    </AlertDialogMedia>
                    <AlertDialogTitle>Restore Secret Version</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to restore this secret to version {version.version}?
                      This will overwrite the current value.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRestore}>Restore</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {canRestore && (
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={subject(ProjectPermissionSub.Secrets, {
                    environment,
                    secretPath,
                    secretName: secretKey,
                    secretTags: ["*"]
                  })}
                >
                  {(isAllowed) => (
                    <Tooltip>
                      <TooltipTrigger>
                        <UnstableIconButton
                          variant="ghost"
                          size="xs"
                          onClick={() => setIsRestoreDialogOpen(true)}
                          isDisabled={isRestoring || isFetchingValue || !isAllowed}
                        >
                          <RotateCcwIcon />
                        </UnstableIconButton>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isAllowed ? "Restore Version" : "Access Denied"}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </ProjectPermissionCan>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <UnstableIconButton
                    variant="ghost"
                    size="xs"
                    onClick={handleCopyValue}
                    isDisabled={isFetchingValue}
                  >
                    <CopyIcon />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>Copy Value</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <UnstableIconButton
                    variant="ghost"
                    size="xs"
                    onClick={handleToggleVisibility}
                    isDisabled={isFetchingValue}
                  >
                    {isValueVisible ? <EyeOffIcon /> : <EyeIcon />}
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>{isValueVisible ? "Hide Value" : "Show Value"}</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Value input display */}
        <Tooltip open={canReadValue && !version.secretValueHidden ? false : undefined}>
          <TooltipTrigger asChild>
            <div className="mb-2 min-w-0 rounded-md border border-border bg-container px-3 py-2 font-mono text-sm [overflow-wrap:anywhere] whitespace-pre-wrap text-bunker-200">
              {/* eslint-disable-next-line no-nested-ternary */}
              {isValueVisible ? (
                isFetchingValue ? (
                  <span className="tracking-widest">••••••••••••••••••••</span>
                ) : (
                  secretValue || <span className="text-muted-foreground">EMPTY</span>
                )
              ) : (
                <span className="tracking-widest">••••••••••••••••••••</span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>Access Denied</TooltipContent>
        </Tooltip>

        {/* Modified by */}
        {version.actor && (
          <div className="flex items-center gap-1.5 text-xs text-muted">
            {/* eslint-disable-next-line no-nested-ternary */}
            {version.actor.actorType === ActorType.USER ? (
              <UserIcon className="size-3" />
            ) : version.actor.actorType === ActorType.IDENTITY ? (
              <HardDriveIcon className="size-3" />
            ) : (
              <ServerCogIcon className="size-3" />
            )}
            <span>
              Modified by{" "}
              <button
                type="button"
                onClick={
                  version.actor.membershipId
                    ? () =>
                        handleViewActor(
                          version.actor!.actorId,
                          version.actor!.actorType,
                          version.actor!.membershipId,
                          version.actor!.groupId,
                          version.actor!.name
                        )
                    : undefined
                }
                className={twMerge(
                  "font-medium text-accent",
                  version.actor.membershipId && "cursor-pointer underline"
                )}
              >
                {getModifiedByName(version.actor.actorType, version.actor.name)}
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function SecretVersionHistory({
  secretId,
  secretKey,
  environment,
  secretPath,
  isRotatedSecret,
  canReadValue
}: Props) {
  const {
    data: secretVersions,
    isLoading,
    refetch
  } = useGetSecretVersion({
    limit: 100,
    offset: 0,
    secretId
  });

  if (isLoading) {
    return (
      <div className="flex flex-col px-4 pt-4">
        {Array.from(Array(6)).map((_, index, arr) => (
          <div key={(index + 1).toString()} className="relative flex h-[122px] gap-4">
            {/* Timeline indicator skeleton */}
            <div className="relative flex flex-col items-center">
              <Skeleton className="absolute top-1.5 left-0 size-3 rounded-full" />
              {index < arr.length - 1 && (
                <div className="absolute top-4.5 -bottom-2 left-[5.5px] w-px bg-border" />
              )}
            </div>

            {/* Content skeleton */}
            <div className="flex-1 pb-6 pl-2">
              {/* Header row skeleton */}
              <div className="mb-2 flex items-center gap-2">
                <Skeleton className="h-5 w-8" />
                {index === 0 && <Skeleton className="h-5 w-16" />}
                <Skeleton className="h-4 w-36" />
              </div>

              {/* Value input skeleton */}
              <Skeleton className="mb-2 h-10 w-full rounded-md" />

              {/* Modified by skeleton */}
              <div className="flex items-center gap-1.5">
                <Skeleton className="size-3 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // should never happen as we disable
  if (!secretVersions || secretVersions.length === 0) {
    return (
      <UnstableEmpty className="bg-transparent">
        <UnstableEmptyHeader>
          <EmptyMedia variant="icon">
            <BanIcon />
          </EmptyMedia>
          <UnstableEmptyTitle>Access Denied</UnstableEmptyTitle>
          <UnstableEmptyDescription>
            You do not have permission to view this secrets history
          </UnstableEmptyDescription>
        </UnstableEmptyHeader>
      </UnstableEmpty>
    );
  }

  const currentVersion = secretVersions[0].version;

  return (
    <div className="flex flex-col overflow-y-auto px-4 pt-4">
      {secretVersions.map((version, index) => (
        <VersionItem
          key={version.id}
          secretId={secretId}
          secretKey={secretKey}
          environment={environment}
          secretPath={secretPath}
          version={version}
          currentVersion={currentVersion}
          isRotatedSecret={isRotatedSecret}
          canReadValue={canReadValue}
          onRestoreSuccess={() => refetch()}
          isLast={index === secretVersions.length - 1}
        />
      ))}
    </div>
  );
}
