import { useState } from "react";
import { subject } from "@casl/ability";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  BanIcon,
  CalendarIcon,
  ClockIcon,
  HexagonIcon,
  MapPinIcon,
  RotateCcw
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  PageLoader,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionHoneyTokenActions } from "@app/context/ProjectPermissionContext/types";
import { HONEY_TOKEN_CREDENTIAL_FIELDS, HONEY_TOKEN_MAP } from "@app/helpers/honeyTokens";
import { HoneyTokenStatus, HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";
import { useResetHoneyToken, useRevokeHoneyToken } from "@app/hooks/api/honeyTokens/mutations";
import {
  useGetHoneyTokenById,
  useGetHoneyTokenCredentials
} from "@app/hooks/api/honeyTokens/queries";

import { CredentialField } from "./ViewHoneyTokenCredentials/CredentialField";
import { HoneyTokenEventsSection } from "./HoneyTokenEventsSection";

type Props = {
  projectId: string;
  honeyTokenId: string | null;
  onClose: () => void;
};

const DrawerContent = ({
  honeyTokenId,
  projectId
}: {
  honeyTokenId: string;
  projectId: string;
}) => {
  const { data: honeyToken, isPending } = useGetHoneyTokenById({
    honeyTokenId,
    projectId,
    enabled: Boolean(honeyTokenId && projectId)
  });

  const { mutateAsync: resetHoneyToken } = useResetHoneyToken();
  const { mutateAsync: revokeHoneyToken, isPending: isRevoking } = useRevokeHoneyToken();
  const { permission } = useProjectPermission();
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const honeyTokenSubject = subject(ProjectPermissionSub.HoneyTokens, {
    environment: honeyToken?.environment?.slug ?? "",
    secretPath: honeyToken?.folder?.path ?? ""
  });

  const canReadCredentials = permission.can(
    ProjectPermissionHoneyTokenActions.ReadCredentials,
    honeyTokenSubject
  );
  const { data: credentials, isPending: isCredentialsPending } = useGetHoneyTokenCredentials({
    honeyTokenId,
    projectId,
    enabled: Boolean(honeyTokenId && projectId && canReadCredentials)
  });

  if (isPending) {
    return (
      <>
        <SheetHeader className="sr-only">
          <SheetTitle>Honey token details</SheetTitle>
        </SheetHeader>
        <div className="flex h-full w-full items-center justify-center p-8">
          <PageLoader />
        </div>
      </>
    );
  }

  if (!honeyToken) {
    return (
      <>
        <SheetHeader className="sr-only">
          <SheetTitle>Honey token details</SheetTitle>
        </SheetHeader>
        <div className="p-4 text-center text-sm text-muted">Could not find honey token.</div>
      </>
    );
  }

  const isTriggered = honeyToken.status === HoneyTokenStatus.Triggered;
  const isRevoked = honeyToken.status === HoneyTokenStatus.Revoked;
  const tokenInfo = HONEY_TOKEN_MAP[honeyToken.type as HoneyTokenType];

  let statusBadgeVariant: "danger" | "neutral" | "success" = "success";
  let statusLabel = "Active";
  if (isTriggered) {
    statusBadgeVariant = "danger";
    statusLabel = "Triggered";
  } else if (isRevoked) {
    statusBadgeVariant = "neutral";
    statusLabel = "Revoked";
  }

  const handleReset = async () => {
    await resetHoneyToken({ honeyTokenId: honeyToken.id, projectId });
    createNotification({
      text: `Honey token "${honeyToken.name}" has been reset`,
      type: "success"
    });
  };

  const handleRevoke = async () => {
    await revokeHoneyToken({ honeyTokenId: honeyToken.id, projectId });
    createNotification({
      text: `Successfully revoked honey token "${honeyToken.name}"`,
      type: "success"
    });
    setIsRevokeOpen(false);
  };

  return (
    <>
      <SheetHeader className="gap-4">
        <div className="flex items-start pr-8">
          <div className="flex items-center gap-3">
            {tokenInfo && (
              <img
                src={`/images/integrations/${tokenInfo.image}`}
                className="h-10 w-10 shrink-0"
                alt={`${tokenInfo.name} logo`}
              />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="truncate">{honeyToken.name}</SheetTitle>
                <Badge variant={statusBadgeVariant}>
                  {isTriggered && <AlertTriangle size={12} className="mr-1" />}
                  {statusLabel}
                </Badge>
              </div>
              <p className="text-xs text-foreground/85">
                {honeyToken.description || `${tokenInfo?.name ?? "Honey"} Token`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-md bg-container p-2 text-xs text-muted">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                <CalendarIcon size={13} />
                <span>
                  Created {formatDistanceToNow(new Date(honeyToken.createdAt), { addSuffix: true })}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {format(new Date(honeyToken.createdAt), "MMMM do, yyyy 'at' h:mm a")}
            </TooltipContent>
          </Tooltip>
          {honeyToken.environment && (
            <div className="flex items-center gap-1.5">
              <MapPinIcon size={13} />
              <span>
                {honeyToken.environment.name}
                {honeyToken.folder?.path && honeyToken.folder.path !== "/"
                  ? ` — ${honeyToken.folder.path}`
                  : ""}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <HexagonIcon size={13} />
            <span>
              {honeyToken.openEvents} open event{honeyToken.openEvents !== 1 && "s"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <ClockIcon size={13} />
            <span>Active for {formatDistanceToNow(new Date(honeyToken.createdAt))}</span>
          </div>
        </div>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {isRevoked && (
          <Alert variant="info">
            <BanIcon />
            <AlertTitle>Honey token revoked</AlertTitle>
            <AlertDescription>
              The AWS IAM credentials have been revoked and the decoy secrets removed. The honey
              token record and its events are preserved for audit purposes.
            </AlertDescription>
          </Alert>
        )}

        {isTriggered && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>What to do now?</AlertTitle>
            <AlertDescription className="gap-2">
              <p>
                If this is a false alarm, reset the honey token to return it to active status and
                hide past events.
              </p>
              <p>
                If this activity is suspicious, follow your company&apos;s incident response plan,
                rotate any real secrets stored alongside the honey token, then revoke and replace
                the honey token.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {!isRevoked && (
          <ProjectPermissionCan
            I={ProjectPermissionHoneyTokenActions.ReadCredentials}
            a={honeyTokenSubject}
          >
            {(isAllowed) =>
              isAllowed && (
                <div>
                  {isCredentialsPending && (
                    <div className="flex flex-col gap-2 py-2">
                      <Skeleton className="h-8 w-full rounded-md" />
                      <Skeleton className="h-8 w-full rounded-md" />
                    </div>
                  )}
                  {!isCredentialsPending && credentials && (
                    <div className="flex flex-col gap-4">
                      {(HONEY_TOKEN_CREDENTIAL_FIELDS[honeyToken.type as HoneyTokenType] ?? []).map(
                        ({ key, label }) => {
                          const mapping = honeyToken.secretsMapping as Record<string, string>;
                          const secretName = mapping[key];
                          const value =
                            (secretName ? credentials[secretName] : undefined) ?? credentials[key];
                          return <CredentialField key={key} label={label} value={value} />;
                        }
                      )}
                    </div>
                  )}
                  {!isCredentialsPending && !credentials && (
                    <p className="text-xs text-muted">No credentials available.</p>
                  )}
                </div>
              )
            }
          </ProjectPermissionCan>
        )}

        <HoneyTokenEventsSection honeyTokenId={honeyTokenId} projectId={projectId} />
      </div>

      {!isRevoked && (
        <SheetFooter className="shrink-0 items-center border-t">
          {isTriggered && (
            <ProjectPermissionCan
              I={ProjectPermissionHoneyTokenActions.Reset}
              a={honeyTokenSubject}
            >
              {(isAllowed) => (
                <Button
                  variant="outline"
                  onClick={() => setIsResetOpen(true)}
                  isDisabled={!isAllowed}
                >
                  <RotateCcw />
                  Reset
                </Button>
              )}
            </ProjectPermissionCan>
          )}
          <ProjectPermissionCan I={ProjectPermissionHoneyTokenActions.Revoke} a={honeyTokenSubject}>
            {(isAllowed) => (
              <Button
                className="ml-auto"
                variant="danger"
                onClick={() => setIsRevokeOpen(true)}
                isDisabled={!isAllowed}
              >
                <BanIcon />
                Revoke
              </Button>
            )}
          </ProjectPermissionCan>
        </SheetFooter>
      )}

      <AlertDialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <RotateCcw />
            </AlertDialogMedia>
            <AlertDialogTitle>Reset {honeyToken.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revert the honey token status to active and hide past events. The honey
              token will be able to trigger again on new activity. Its credentials will remain
              unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await handleReset();
                setIsResetOpen(false);
              }}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={isRevokeOpen}
        confirmationValue={honeyToken.name}
        onOpenChange={setIsRevokeOpen}
      >
        <AlertDialogContent className="sm:max-w-xl!">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to revoke {honeyToken.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <Alert variant="danger" appearance="borderless">
                <AlertDescription>
                  This will revoke the AWS IAM credentials and remove the associated decoy secrets
                  from this environment. The honey token record and its events will be preserved for
                  audit purposes.
                </AlertDescription>
              </Alert>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogConfirmationField
            onConfirm={() => {
              if (!isRevoking) handleRevoke().catch(() => undefined);
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isRevoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isRevoking}
              onClick={(event) => {
                event.preventDefault();
                if (!isRevoking) handleRevoke().catch(() => undefined);
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const HoneyTokenDetailsDrawer = ({ projectId, honeyTokenId, onClose }: Props) => {
  const isOpen = Boolean(honeyTokenId);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="flex h-full flex-col gap-y-0 overflow-hidden sm:max-w-3xl">
        {isOpen && honeyTokenId && (
          <DrawerContent honeyTokenId={honeyTokenId} projectId={projectId} />
        )}
      </SheetContent>
    </Sheet>
  );
};
