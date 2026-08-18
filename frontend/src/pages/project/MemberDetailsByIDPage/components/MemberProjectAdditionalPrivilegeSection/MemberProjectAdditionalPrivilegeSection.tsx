import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistance } from "date-fns";
import {
  CircleAlertIcon,
  ClockAlertIcon,
  ClockIcon,
  EllipsisIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldIcon
} from "lucide-react";
import picomatch from "picomatch";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldLabel,
  IconButton,
  Input,
  PageLoader,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
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
import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useUser
} from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useDeleteProjectUserAdditionalPrivilege,
  useListProjectUserPrivileges,
  useRevokeAccessRequest
} from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { projectUserPrivilegeKeys } from "@app/hooks/api/projectUserAdditionalPrivilege/queries";
import { TWorkspaceUser } from "@app/hooks/api/types";
import {
  canModifyByGrantConditions,
  getMemberAssignPrivilegesConditions
} from "@app/lib/fn/permission";

import { MembershipProjectAdditionalPrivilegeModifySection } from "./MembershipProjectAdditionalPrivilegeModifySection";

type Props = {
  membershipDetails: TWorkspaceUser;
};

export const MemberProjectAdditionalPrivilegeSection = ({ membershipDetails }: Props) => {
  const sheetContainerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { user } = useUser();
  const userId = user?.id;
  const { currentProject } = useProject();
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deletePrivilege",
    "modifyPrivilege",
    "revokeAccess"
  ] as const);
  const { permission } = useProjectPermission();
  const [deletePrivilegeConfirmation, setDeletePrivilegeConfirmation] = useState("");
  const [revokeAccessConfirmation, setRevokeAccessConfirmation] = useState("");

  const deletePrivilegeMutation = useDeleteProjectUserAdditionalPrivilege();
  const revokeAccessMutation = useRevokeAccessRequest();

  const {
    data: userProjectPrivileges,
    isPending,
    isError,
    refetch: refetchPrivileges
  } = useListProjectUserPrivileges(membershipDetails?.id);

  const isOwnProjectMembershipDetails = userId === membershipDetails?.user?.id;

  const assignPrivilegesConditions = useMemo(
    () => getMemberAssignPrivilegesConditions(permission),
    [permission]
  );

  const canModifyMemberPrivileges = useMemo(() => {
    const targetEmail = membershipDetails?.user?.email;
    if (!targetEmail) return false;

    return canModifyByGrantConditions({
      targetValue: targetEmail,
      allowed: assignPrivilegesConditions?.emails,
      forbidden: assignPrivilegesConditions?.forbiddenEmails,
      isMatch: (value, pattern) => picomatch.isMatch(value, pattern, { nocase: true })
    });
  }, [assignPrivilegesConditions, membershipDetails?.user?.email]);

  const handlePrivilegeDelete = async () => {
    const { id } = popUp?.deletePrivilege?.data as { id: string };
    await deletePrivilegeMutation.mutateAsync({
      privilegeId: id,
      projectMembershipId: membershipDetails.id
    });
    createNotification({ type: "success", text: "Successfully removed the privilege" });
    setDeletePrivilegeConfirmation("");
    handlePopUpClose("deletePrivilege");
  };

  const handleRevokeAccess = async () => {
    const { accessApprovalRequestId } = popUp?.revokeAccess?.data as {
      accessApprovalRequestId: string;
    };
    await revokeAccessMutation.mutateAsync({
      requestId: accessApprovalRequestId,
      projectSlug: currentProject?.slug || ""
    });
    await queryClient.invalidateQueries({
      queryKey: projectUserPrivilegeKeys.list(membershipDetails.id)
    });
    createNotification({ type: "success", text: "Successfully revoked access" });
    setRevokeAccessConfirmation("");
    handlePopUpClose("revokeAccess");
  };

  const hasAdditionalPrivileges = Boolean(userProjectPrivileges?.length);
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {isCertManager
              ? "Certificate Manager Additional Privileges"
              : "Project Additional Privileges"}
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/access-controls/additional-privileges#api" />
          </CardTitle>
          <CardDescription>Assign one-off policies to this user</CardDescription>
          {!isOwnProjectMembershipDetails && hasAdditionalPrivileges && (
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.Member}
              >
                {(isAllowed) => {
                  const isEditDisabled = !isAllowed || !canModifyMemberPrivileges;
                  const button = (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        handlePopUpOpen("modifyPrivilege");
                      }}
                      isDisabled={isEditDisabled}
                    >
                      <PlusIcon />
                      Add Additional Privileges
                    </Button>
                  );
                  return isEditDisabled ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block">{button}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        You don&apos;t have permission to edit this user&apos;s privileges
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    button
                  );
                }}
              </ProjectPermissionCan>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {isError && (
            <Alert variant="danger">
              <CircleAlertIcon />
              <AlertTitle>Could not load additional privileges</AlertTitle>
              <AlertDescription>
                <span>Retry to load this user&apos;s additional privileges.</span>
                <Button
                  size="xs"
                  variant="danger"
                  onClick={() => refetchPrivileges().catch(() => undefined)}
                >
                  <RefreshCwIcon />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {!isError && isPending && (
            <div className="h-40 w-full">
              <PageLoader lottieClassName="w-16" />
            </div>
          )}
          {!isError &&
            !isPending &&
            (userProjectPrivileges?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/2">Name</TableHead>
                    <TableHead className="w-1/2">Duration</TableHead>
                    {!isOwnProjectMembershipDetails && <TableHead className="w-5" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isPending &&
                    userProjectPrivileges?.map((privilegeDetails) => {
                      const isTemporary = privilegeDetails?.isTemporary;
                      const isLinkedToAccessApproval = privilegeDetails?.isLinkedToAccessApproval;
                      const isExpired =
                        privilegeDetails.isTemporary &&
                        new Date() > new Date(privilegeDetails.temporaryAccessEndTime || "");

                      let text = "Permanent";
                      let toolTipText = "Non-Expiring Access";
                      if (privilegeDetails.isTemporary) {
                        if (isExpired) {
                          text = "Access Expired";
                          toolTipText = "Timed Access Expired";
                        } else {
                          text = formatDistance(
                            new Date(privilegeDetails.temporaryAccessEndTime || ""),
                            new Date()
                          );
                          toolTipText = `Until ${format(
                            new Date(privilegeDetails.temporaryAccessEndTime || ""),
                            "yyyy-MM-dd hh:mm:ss aaa"
                          )}`;
                        }
                      }

                      return (
                        <TableRow key={`user-project-privilege-${privilegeDetails?.id}`}>
                          <TableCell className="flex items-center gap-2">
                            <span className="truncate">{privilegeDetails.slug}</span>
                            {isLinkedToAccessApproval && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge className="capitalize" variant="info">
                                    <ShieldIcon />
                                    Managed
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  This privilege is managed by an access approval request.
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell>
                            {isTemporary ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    className="capitalize"
                                    variant={isExpired ? "danger" : "warning"}
                                  >
                                    {isExpired ? <ClockAlertIcon /> : <ClockIcon />}
                                    {text}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>{toolTipText}</TooltipContent>
                              </Tooltip>
                            ) : (
                              text
                            )}
                          </TableCell>
                          {!isOwnProjectMembershipDetails && (
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <IconButton
                                    size="xs"
                                    variant="ghost"
                                    aria-label="Open additional privilege actions"
                                  >
                                    <EllipsisIcon />
                                  </IconButton>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {isLinkedToAccessApproval ? (
                                    <ProjectPermissionCan
                                      I={ProjectPermissionMemberActions.AssignAdditionalPrivileges}
                                      a={ProjectPermissionSub.Member}
                                    >
                                      {(isAllowed) => {
                                        const isApproverForPrivilege =
                                          privilegeDetails.policyApproverUserIds?.includes(
                                            userId || ""
                                          );
                                        return (
                                          <DropdownMenuItem
                                            isDisabled={
                                              !privilegeDetails.accessApprovalRequestId ||
                                              ((!isAllowed || !canModifyMemberPrivileges) &&
                                                !isApproverForPrivilege)
                                            }
                                            variant="danger"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handlePopUpOpen("revokeAccess", {
                                                accessApprovalRequestId:
                                                  privilegeDetails.accessApprovalRequestId,
                                                slug: privilegeDetails.slug
                                              });
                                            }}
                                          >
                                            Revoke Access
                                          </DropdownMenuItem>
                                        );
                                      }}
                                    </ProjectPermissionCan>
                                  ) : (
                                    <>
                                      <ProjectPermissionCan
                                        I={ProjectPermissionActions.Edit}
                                        a={ProjectPermissionSub.Member}
                                      >
                                        {(isAllowed) => (
                                          <DropdownMenuItem
                                            isDisabled={!isAllowed || !canModifyMemberPrivileges}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handlePopUpOpen("modifyPrivilege", privilegeDetails);
                                            }}
                                          >
                                            Edit Additional Privilege
                                          </DropdownMenuItem>
                                        )}
                                      </ProjectPermissionCan>
                                      <ProjectPermissionCan
                                        I={ProjectPermissionActions.Edit}
                                        a={ProjectPermissionSub.Member}
                                      >
                                        {(isAllowed) => (
                                          <DropdownMenuItem
                                            isDisabled={!isAllowed || !canModifyMemberPrivileges}
                                            variant="danger"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handlePopUpOpen("deletePrivilege", {
                                                id: privilegeDetails?.id,
                                                slug: privilegeDetails?.slug
                                              });
                                            }}
                                          >
                                            Remove Additional Privilege
                                          </DropdownMenuItem>
                                        )}
                                      </ProjectPermissionCan>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>This user has no additional privileges</EmptyTitle>
                  <EmptyDescription>
                    Add an additional privilege to grant one-off access policies
                  </EmptyDescription>
                </EmptyHeader>
                {!isOwnProjectMembershipDetails && (
                  <EmptyContent>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={ProjectPermissionSub.Member}
                    >
                      {(isAllowed) => {
                        const isEditDisabled = !isAllowed || !canModifyMemberPrivileges;
                        const button = (
                          <Button
                            variant="project"
                            size="xs"
                            onClick={() => {
                              handlePopUpOpen("modifyPrivilege");
                            }}
                            isDisabled={isEditDisabled}
                          >
                            <PlusIcon />
                            Add Additional Privileges
                          </Button>
                        );
                        return isEditDisabled ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-block">{button}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              You don&apos;t have permission to edit this user&apos;s privileges
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          button
                        );
                      }}
                    </ProjectPermissionCan>
                  </EmptyContent>
                )}
              </Empty>
            ))}
        </CardContent>
      </Card>
      <Sheet
        open={popUp.modifyPrivilege.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("modifyPrivilege", isOpen)}
      >
        <SheetContent ref={sheetContainerRef} className="flex h-full flex-col gap-y-0 sm:max-w-6xl">
          <SheetHeader className="border-b">
            <SheetTitle>Additional Privileges</SheetTitle>
            <SheetDescription>
              Additional privileges take precedence over roles when permissions conflict
            </SheetDescription>
          </SheetHeader>
          <MembershipProjectAdditionalPrivilegeModifySection
            onGoBack={() => handlePopUpClose("modifyPrivilege")}
            projectMembershipId={membershipDetails?.id}
            privilegeId={(popUp?.modifyPrivilege?.data as { id: string })?.id}
            isDisabled={
              isOwnProjectMembershipDetails ||
              permission.cannot(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member)
            }
            menuPortalContainerRef={sheetContainerRef}
          />
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={popUp.deletePrivilege.isOpen}
        onOpenChange={(isOpen) => {
          if (deletePrivilegeMutation.isPending) return;
          if (!isOpen) setDeletePrivilegeConfirmation("");
          handlePopUpToggle("deletePrivilege", isOpen);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove additional privilege &quot;
              {(popUp?.deletePrivilege?.data as { slug: string; id: string })?.slug}&quot;?
            </AlertDialogTitle>
            <Alert variant="danger" appearance="borderless">
              <AlertDescription>
                This policy will no longer grant additional access to this user.
              </AlertDescription>
            </Alert>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="remove-member-privilege-confirmation">
              Type &quot;remove&quot; to confirm
            </FieldLabel>
            <Input
              id="remove-member-privilege-confirmation"
              value={deletePrivilegeConfirmation}
              onChange={(event) => setDeletePrivilegeConfirmation(event.target.value)}
              autoComplete="off"
              disabled={deletePrivilegeMutation.isPending}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={deletePrivilegeMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={deletePrivilegeMutation.isPending}
              isDisabled={deletePrivilegeConfirmation !== "remove"}
              onClick={(event) => {
                event.preventDefault();
                handlePrivilegeDelete().catch(() => undefined);
              }}
            >
              Remove Privilege
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={popUp.revokeAccess.isOpen}
        onOpenChange={(isOpen) => {
          if (revokeAccessMutation.isPending) return;
          if (!isOpen) setRevokeAccessConfirmation("");
          handlePopUpToggle("revokeAccess", isOpen);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revoke access for &quot;{(popUp?.revokeAccess?.data as { slug: string })?.slug}&quot;?
            </AlertDialogTitle>
            <Alert variant="danger" appearance="borderless">
              <AlertDescription>
                This will revoke the access approval request and remove its associated privilege.
              </AlertDescription>
            </Alert>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="revoke-member-access-confirmation">
              Type &quot;revoke&quot; to confirm
            </FieldLabel>
            <Input
              id="revoke-member-access-confirmation"
              value={revokeAccessConfirmation}
              onChange={(event) => setRevokeAccessConfirmation(event.target.value)}
              autoComplete="off"
              disabled={revokeAccessMutation.isPending}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={revokeAccessMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={revokeAccessMutation.isPending}
              isDisabled={revokeAccessConfirmation !== "revoke"}
              onClick={(event) => {
                event.preventDefault();
                handleRevokeAccess().catch(() => undefined);
              }}
            >
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
