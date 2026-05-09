import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  BanIcon,
  CalendarIcon,
  ClockIcon,
  HexagonIcon,
  KeyIcon,
  MapPinIcon,
  RotateCcw
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
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
  Button,
  Field,
  FieldContent,
  FieldLabel,
  Input,
  PageLoader,
  Sheet,
  SheetContent,
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
  const { mutateAsync: revokeHoneyToken } = useRevokeHoneyToken();
  const { permission } = useProjectPermission();
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [revokeInput, setRevokeInput] = useState("");
  const canReadCredentials = permission.can(
    ProjectPermissionHoneyTokenActions.ReadCredentials,
    ProjectPermissionSub.HoneyTokens
  );
  const { data: credentials, isPending: isCredentialsPending } = useGetHoneyTokenCredentials({
    honeyTokenId,
    projectId,
    enabled: Boolean(honeyTokenId && projectId && canReadCredentials)
  });

  useEffect(() => {
    setRevokeInput("");
  }, [isRevokeOpen]);

  if (isPending) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <PageLoader />
      </div>
    );
  }

  if (!honeyToken) {
    return <div className="p-4 text-center text-sm text-muted">Could not find honey token.</div>;
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
  };

  return (
    <>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {tokenInfo && (
              <img
                src={`/images/integrations/${tokenInfo.image}`}
                className="h-10 w-10 shrink-0"
                alt={`${tokenInfo.name} logo`}
              />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">{honeyToken.name}</p>
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
          <div className="flex shrink-0 items-center gap-2">
            {isTriggered && (
              <Button variant="outline" size="xs" onClick={() => setIsResetOpen(true)}>
                <RotateCcw size={14} />
                Reset
              </Button>
            )}
            {!isRevoked && (
              <Button variant="danger" size="xs" onClick={() => setIsRevokeOpen(true)}>
                <BanIcon size={14} />
                Revoke
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-xs text-muted">
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

        {!isRevoked && (
          <ProjectPermissionCan
            I={ProjectPermissionHoneyTokenActions.ReadCredentials}
            a={ProjectPermissionSub.HoneyTokens}
          >
            {(isAllowed) =>
              isAllowed && (
                <div className="border-t border-border pt-4">
                  <div className="mb-2 flex items-center gap-1.5 text-xs text-muted">
                    <KeyIcon size={13} />
                    <span>Credentials</span>
                  </div>
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

        {isRevoked && (
          <div className="rounded-md border border-border bg-container p-4">
            <div className="mb-2 flex items-center gap-2">
              <BanIcon size={16} className="text-muted" />
              <p className="text-sm font-medium text-muted">Honey token revoked</p>
            </div>
            <p className="text-xs text-foreground/85">
              The AWS IAM credentials have been revoked and the decoy secrets removed. The honey
              token record and its events are preserved for audit purposes.
            </p>
          </div>
        )}

        {isTriggered && (
          <Accordion
            type="single"
            collapsible
            variant="ghost"
            className="border-t border-border pt-2"
          >
            <AccordionItem value="response-guidance">
              <AccordionTrigger className="text-sm font-medium">
                How should I respond?
              </AccordionTrigger>
              <AccordionContent>
                <Alert variant="info" className="flex flex-col gap-4">
                  <div>
                    <p className="text-xs font-medium text-white">1. False alarm confirmed?</p>
                    <p className="text-xs text-accent">
                      You might want to <strong>reset the honey token</strong>. This will revert its
                      status to active and hide the past events, so that the honey token can be
                      triggered again.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white">
                      2. Malicious activity confirmed?
                    </p>
                    <p className="text-xs text-accent">
                      1. Take immediate steps as per your company Incident Response Plan.
                      <br />
                      2. <strong>Rotate any real secrets</strong> that were stored alongside the
                      honey token, as they may also be compromised.
                      <br />
                      3. <strong>Revoke the honey token</strong>. This will prevent any new
                      connections while we keep the compromised key in our records.
                      <br />
                      4. Don&apos;t forget to recreate a new honey token to replace it in the same
                      location.
                    </p>
                  </div>
                </Alert>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <HoneyTokenEventsSection honeyTokenId={honeyTokenId} projectId={projectId} />
      </div>

      <AlertDialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <RotateCcw />
            </AlertDialogMedia>
            <AlertDialogTitle>Reset {honeyToken.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revert the honey token status to active and hide past events. The honey
              token will be able to trigger again on new activity.
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
      <AlertDialog open={isRevokeOpen} onOpenChange={setIsRevokeOpen}>
        <AlertDialogContent className="sm:max-w-xl!">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <BanIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Are you sure you want to revoke {honeyToken.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke the AWS IAM credentials and remove the associated decoy secrets from
              this environment. The honey token record and its events will be preserved for audit
              purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (revokeInput === honeyToken.name) handleRevoke();
            }}
          >
            <Field>
              <FieldLabel>
                Type <span className="font-bold">{honeyToken.name}</span> to confirm
              </FieldLabel>
              <FieldContent>
                <Input
                  value={revokeInput}
                  onChange={(e) => setRevokeInput(e.target.value)}
                  placeholder={`Type ${honeyToken.name} here`}
                />
              </FieldContent>
            </Field>
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={handleRevoke}
              disabled={revokeInput !== honeyToken.name}
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
      <SheetContent className="flex h-full flex-col gap-y-0 overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="border-b">
          <SheetTitle>Honey Token Details</SheetTitle>
        </SheetHeader>
        {isOpen && honeyTokenId && (
          <DrawerContent honeyTokenId={honeyTokenId} projectId={projectId} />
        )}
      </SheetContent>
    </Sheet>
  );
};
