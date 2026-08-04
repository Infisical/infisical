import { subject } from "@casl/ability";
import { format, formatDistance } from "date-fns";
import { FileTextIcon, RotateCwIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  DeleteConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
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
import { DynamicSecretProviders, TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { DynamicSecretLeaseStatus } from "@app/hooks/api/dynamicSecretLease/types";

import { RenewDynamicSecretLease } from "./RenewDynamicSecretLease";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  dynamicSecret?: TDynamicSecret;
  dynamicSecretName: string;
  projectSlug: string;
  environment: string;
  secretPath: string;
  onClickNewLease: () => void;
  onClose: () => void;
};

const DYNAMIC_SECRETS_WITHOUT_RENEWAL = [
  DynamicSecretProviders.Github,
  DynamicSecretProviders.Ssh,
  DynamicSecretProviders.Tailscale
];

export const DynamicSecretLease = ({
  isOpen,
  onOpenChange,
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
  const { data: leases, isPending: isLeaseLoading } = useGetDynamicSecretLeases({
    projectSlug,
    environmentSlug: environment,
    path: secretPath,
    dynamicSecretName,
    enabled: isOpen && Boolean(dynamicSecret)
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
      text: "Successfully deleted lease"
    });
  };

  const canRenew = dynamicSecret
    ? !DYNAMIC_SECRETS_WITHOUT_RENEWAL.includes(dynamicSecret.type)
    : false;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>Dynamic secret leases</span>
              <Badge variant="neutral">{dynamicSecretName}</Badge>
            </DialogTitle>
            <DialogDescription>Revoke or renew your secret leases</DialogDescription>
          </DialogHeader>
          {dynamicSecret && (
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lease ID</TableHead>
                    <TableHead>Expire At</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isLeaseLoading && leases?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Empty>
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <FileTextIcon />
                            </EmptyMedia>
                            <EmptyTitle>No leases found</EmptyTitle>
                          </EmptyHeader>
                          <EmptyContent>
                            <Button onClick={onClickNewLease} size="sm">
                              New Lease
                            </Button>
                          </EmptyContent>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  )}
                  {(leases || []).map(({ id, expireAt, status, statusDetails }) => (
                    <TableRow key={id}>
                      <TableCell>
                        {id}
                        {Boolean(status) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <TriangleAlertIcon className="ml-2 inline size-3.5 text-warning" />
                            </TooltipTrigger>
                            <TooltipContent>{statusDetails || status || ""}</TooltipContent>
                          </Tooltip>
                        )}
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
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {canRenew && (
                            <ProjectPermissionCan
                              I={ProjectPermissionDynamicSecretActions.Lease}
                              a={subject(ProjectPermissionSub.DynamicSecrets, {
                                environment,
                                secretPath,
                                metadata: dynamicSecret.metadata
                              })}
                              renderTooltip
                              allowedLabel="Renew"
                            >
                              {(isAllowed) => (
                                <IconButton
                                  aria-label="renew-lease"
                                  variant="ghost"
                                  size="sm"
                                  isDisabled={!isAllowed}
                                  onClick={() => handlePopUpOpen("renewSecret", { leaseId: id })}
                                >
                                  <RotateCwIcon />
                                </IconButton>
                              )}
                            </ProjectPermissionCan>
                          )}
                          <ProjectPermissionCan
                            I={ProjectPermissionDynamicSecretActions.Lease}
                            a={subject(ProjectPermissionSub.DynamicSecrets, {
                              environment,
                              secretPath,
                              metadata: dynamicSecret.metadata
                            })}
                            renderTooltip
                            allowedLabel="Delete"
                          >
                            {(isAllowed) => (
                              <IconButton
                                aria-label="delete-lease"
                                variant="ghost"
                                size="sm"
                                isDisabled={!isAllowed}
                                onClick={() => handlePopUpOpen("deleteSecret", { leaseId: id })}
                              >
                                <XIcon />
                              </IconButton>
                            )}
                          </ProjectPermissionCan>
                          {status === DynamicSecretLeaseStatus.FailedDeletion && (
                            <ProjectPermissionCan
                              I={ProjectPermissionDynamicSecretActions.Lease}
                              a={subject(ProjectPermissionSub.DynamicSecrets, {
                                environment,
                                secretPath,
                                metadata: dynamicSecret.metadata
                              })}
                              renderTooltip
                              allowedLabel="Force Delete. This action will remove the secret from internal storage, but it will remain in external systems."
                            >
                              {(isAllowed) => (
                                <IconButton
                                  aria-label="force-delete-lease"
                                  variant="ghost"
                                  size="sm"
                                  className="text-danger"
                                  isDisabled={!isAllowed}
                                  onClick={() =>
                                    handlePopUpOpen("deleteSecret", { leaseId: id, isForced: true })
                                  }
                                >
                                  <TriangleAlertIcon />
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
              {!isLeaseLoading && Boolean(leases?.length) && (
                <div className="mt-6 flex items-center gap-4">
                  <ProjectPermissionCan
                    I={ProjectPermissionDynamicSecretActions.Lease}
                    a={subject(ProjectPermissionSub.DynamicSecrets, {
                      environment,
                      secretPath,
                      metadata: dynamicSecret.metadata
                    })}
                  >
                    {(isAllowed) => (
                      <Button onClick={onClickNewLease} size="xs" isDisabled={!isAllowed}>
                        New Lease
                      </Button>
                    )}
                  </ProjectPermissionCan>
                  <Button onClick={onClose} variant="ghost" size="xs">
                    Close
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {dynamicSecret && (
        <>
          <RenewDynamicSecretLease
            isOpen={popUp.renewSecret.isOpen}
            onOpenChange={(state) => handlePopUpToggle("renewSecret", state)}
            onClose={() => handlePopUpClose("renewSecret")}
            projectSlug={projectSlug}
            leaseId={(popUp.renewSecret?.data as { leaseId: string })?.leaseId}
            dynamicSecretName={dynamicSecretName}
            dynamicSecret={dynamicSecret}
            secretPath={secretPath}
            environment={environment}
          />
          <DeleteConfirmDialog
            isOpen={popUp.deleteSecret.isOpen}
            onOpenChange={(state) => handlePopUpToggle("deleteSecret", state)}
            title="Do you want to delete this lease?"
            confirmKey="delete"
            isPending={deleteDynamicSecretLease.isPending}
            onConfirm={handleDynamicSecretDeleteLease}
          />
        </>
      )}
    </>
  );
};
