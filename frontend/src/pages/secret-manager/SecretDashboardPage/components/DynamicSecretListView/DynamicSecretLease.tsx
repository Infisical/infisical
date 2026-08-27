import { subject } from "@casl/ability";
import { format, formatDistance } from "date-fns";
import { CircleXIcon, RefreshCwIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";

import { dynamicSecretProviderRegistry } from "@app/components/dynamic-secrets";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertAction,
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
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionDynamicSecretActions, ProjectPermissionSub } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useGetDynamicSecretLeases, useRevokeDynamicSecretLease } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { DynamicSecretLeaseStatus } from "@app/hooks/api/dynamicSecretLease/types";

import { RenewDynamicSecretLease } from "./RenewDynamicSecretLease";

type Props = {
  dynamicSecret: TDynamicSecret;
  dynamicSecretName: string;
  projectSlug: string;
  environment: string;
  secretPath: string;
  onClickNewLease: () => void;
  onClose: () => void;
};

export const DynamicSecretLease = ({
  projectSlug,
  dynamicSecretName,
  environment,
  secretPath,
  onClickNewLease,
  onClose,
  dynamicSecret
}: Props) => {
  const { handlePopUpOpen, popUp, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteSecret",
    "renewSecret"
  ] as const);
  const {
    data: leases,
    isPending: isLeaseLoading,
    isError: isLeaseError,
    refetch: refetchLeases
  } = useGetDynamicSecretLeases({
    projectSlug,
    environmentSlug: environment,
    path: secretPath,
    dynamicSecretName
  });

  const deleteDynamicSecretLease = useRevokeDynamicSecretLease();

  const handleDynamicSecretDeleteLease = async () => {
    const { leaseId, isForced } = popUp.deleteSecret.data as {
      leaseId: string;
      isForced?: boolean;
    };
    await deleteDynamicSecretLease.mutateAsync({
      environmentSlug: environment,
      projectSlug,
      path: secretPath,
      dynamicSecretName,
      leaseId,
      isForced
    });
    handlePopUpClose("deleteSecret");
    createNotification({
      type: "success",
      text: isForced ? "Lease deleted" : "Lease revoked"
    });
  };

  const canRenew = dynamicSecretProviderRegistry.requireLeaseCapabilities(
    dynamicSecret.type
  ).supportsRenewal;
  const selectedLease = popUp.deleteSecret.data as
    | { leaseId: string; isForced?: boolean }
    | undefined;

  const handleDeleteConfirmation = () => {
    if (deleteDynamicSecretLease.isPending) return;
    handleDynamicSecretDeleteLease().catch(() => undefined);
  };

  const permissionSubject = subject(ProjectPermissionSub.DynamicSecrets, {
    environment,
    secretPath,
    metadata: dynamicSecret.metadata
  });

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {isLeaseError && (
        <Alert variant="danger">
          <CircleXIcon />
          <AlertTitle>Could not load leases.</AlertTitle>
          <AlertDescription>
            Try loading the dynamic secret leases again.
            <AlertAction>
              <Button
                variant="outline"
                size="xs"
                onClick={() => refetchLeases().catch(() => undefined)}
              >
                Retry
              </Button>
            </AlertAction>
          </AlertDescription>
        </Alert>
      )}

      {!isLeaseError && !isLeaseLoading && leases?.length === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No leases found</EmptyTitle>
            <EmptyDescription>
              Provision a lease to generate temporary credentials from this dynamic secret.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ProjectPermissionCan
              I={ProjectPermissionDynamicSecretActions.Lease}
              a={permissionSubject}
            >
              {(isAllowed) => (
                <Button
                  variant="project"
                  size="sm"
                  onClick={onClickNewLease}
                  isDisabled={!isAllowed}
                >
                  New Lease
                </Button>
              )}
            </ProjectPermissionCan>
          </EmptyContent>
        </Empty>
      )}

      {!isLeaseError && (isLeaseLoading || Boolean(leases?.length)) && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lease ID</TableHead>
              <TableHead>Expires At</TableHead>
              <TableHead variant="action" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLeaseLoading &&
              Array.from({ length: 3 }).map((_, index) => (
                <TableRow key={`lease-loading-${index + 1}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell variant="action">
                    <Skeleton className="ml-auto size-7" />
                  </TableCell>
                </TableRow>
              ))}
            {(leases || []).map(({ id, expireAt, status, statusDetails }) => (
              <TableRow key={id}>
                <TableCell className="max-w-80 font-mono">
                  <div className="flex min-w-0 items-center">
                    <span className="truncate">{id}</span>
                    {Boolean(status) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="ml-2 inline-flex shrink-0 rounded-xs text-warning outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Lease warning"
                          >
                            <TriangleAlertIcon className="size-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {statusDetails || status || "Lease warning"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="capitalize">
                        {formatDistance(new Date(expireAt), new Date())}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {format(new Date(expireAt), "yyyy-MM-dd, hh:mm aaa")}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell variant="action">
                  <div className="flex items-center justify-end gap-1">
                    {canRenew && (
                      <ProjectPermissionCan
                        I={ProjectPermissionDynamicSecretActions.Lease}
                        a={permissionSubject}
                        renderTooltip
                        allowedLabel="Renew lease"
                      >
                        {(isAllowed) => (
                          <IconButton
                            aria-label="Renew lease"
                            variant="ghost-muted"
                            size="xs"
                            isDisabled={!isAllowed}
                            onClick={() => handlePopUpOpen("renewSecret", { leaseId: id })}
                          >
                            <RefreshCwIcon />
                          </IconButton>
                        )}
                      </ProjectPermissionCan>
                    )}
                    <ProjectPermissionCan
                      I={ProjectPermissionDynamicSecretActions.Lease}
                      a={permissionSubject}
                      renderTooltip
                      allowedLabel="Revoke lease"
                    >
                      {(isAllowed) => (
                        <IconButton
                          aria-label="Revoke lease"
                          variant="ghost-muted"
                          size="xs"
                          isDisabled={!isAllowed}
                          onClick={() => handlePopUpOpen("deleteSecret", { leaseId: id })}
                        >
                          <Trash2Icon />
                        </IconButton>
                      )}
                    </ProjectPermissionCan>
                    {status === DynamicSecretLeaseStatus.FailedDeletion && (
                      <ProjectPermissionCan
                        I={ProjectPermissionDynamicSecretActions.Lease}
                        a={permissionSubject}
                        renderTooltip
                        allowedLabel="Force delete lease. This removes the lease from Infisical without revoking it in the external provider."
                      >
                        {(isAllowed) => (
                          <IconButton
                            aria-label="Force delete lease"
                            variant="danger"
                            size="xs"
                            isDisabled={!isAllowed}
                            onClick={() =>
                              handlePopUpOpen("deleteSecret", { leaseId: id, isForced: true })
                            }
                          >
                            <Trash2Icon />
                          </IconButton>
                        )}
                      </ProjectPermissionCan>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {!isLeaseLoading && !isLeaseError && Boolean(leases?.length) && (
        <DialogFooter>
          <Button onClick={onClose} variant="ghost" size="sm">
            Close
          </Button>
          <ProjectPermissionCan
            I={ProjectPermissionDynamicSecretActions.Lease}
            a={permissionSubject}
          >
            {(isAllowed) => (
              <Button onClick={onClickNewLease} variant="project" size="sm" isDisabled={!isAllowed}>
                New Lease
              </Button>
            )}
          </ProjectPermissionCan>
        </DialogFooter>
      )}

      <Dialog
        open={popUp.renewSecret.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("renewSecret", isOpen)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renew Lease</DialogTitle>
            <DialogDescription>Extend this lease by a new TTL.</DialogDescription>
          </DialogHeader>
          <RenewDynamicSecretLease
            onClose={() => handlePopUpClose("renewSecret")}
            projectSlug={projectSlug}
            leaseId={(popUp.renewSecret?.data as { leaseId: string })?.leaseId}
            dynamicSecretName={dynamicSecretName}
            dynamicSecret={dynamicSecret}
            secretPath={secretPath}
            environment={environment}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={popUp.deleteSecret.isOpen}
        confirmationValue="delete"
        onOpenChange={(isOpen) => {
          if (!deleteDynamicSecretLease.isPending) handlePopUpToggle("deleteSecret", isOpen);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {selectedLease?.isForced ? "Force Delete Lease?" : "Revoke Lease?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedLease?.isForced
                ? "This removes the lease from Infisical without revoking it in the external provider. This cannot be undone."
                : "This revokes the temporary credentials and deletes the lease. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogConfirmationField
            inputProps={{
              disabled: deleteDynamicSecretLease.isPending,
              placeholder: "Type delete here"
            }}
            onConfirm={handleDeleteConfirmation}
          />
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={deleteDynamicSecretLease.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={deleteDynamicSecretLease.isPending}
              onClick={(event) => {
                event.preventDefault();
                handleDeleteConfirmation();
              }}
            >
              {selectedLease?.isForced ? "Force Delete" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
