import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format, formatDistance } from "date-fns";
import { ClockAlertIcon, ClockIcon, EllipsisIcon, PencilIcon } from "lucide-react";
import picomatch from "picomatch";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { PageLoader } from "@app/components/v3";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
} from "@app/components/v3/generic";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useUser
} from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { formatProjectRoleName } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";
import { useUpdateUserWorkspaceRole } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { TProjectRole } from "@app/hooks/api/roles/types";
import { TWorkspaceUser } from "@app/hooks/api/types";
import { canModifyByGrantConditions, getMemberAssignRoleConditions } from "@app/lib/fn/permission";

import { MemberMultiRoleModify } from "./MemberMultiRoleModify";
import { MemberSingleRoleModify } from "./MemberSingleRoleModify";

type Props = {
  membershipDetails: TWorkspaceUser;
  isMembershipDetailsLoading?: boolean;
  onOpenUpgradeModal: () => void;
};

export const MemberRoleDetailsSection = ({
  membershipDetails,
  isMembershipDetailsLoading,
  onOpenUpgradeModal
}: Props) => {
  const { user } = useUser();
  const userId = user?.id;
  const { projectId, currentProject } = useProject();
  const { permission } = useProjectPermission();
  const navigate = useNavigate();
  const [deleteRoleConfirmation, setDeleteRoleConfirmation] = useState("");

  const assignRoleConditions = useMemo(
    () => getMemberAssignRoleConditions(permission),
    [permission]
  );

  const canModifyMemberRoles = useMemo(() => {
    const memberEmail = membershipDetails?.user?.email;
    if (!memberEmail) return false;

    return canModifyByGrantConditions({
      targetValue: memberEmail,
      allowed: assignRoleConditions?.emails,
      forbidden: assignRoleConditions?.forbiddenEmails,
      isMatch: (value, pattern) => picomatch.isMatch(value, pattern)
    });
  }, [assignRoleConditions, membershipDetails?.user?.email]);

  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deleteRole",
    "modifyManyRoles",
    "modifyRole"
  ] as const);
  const updateUserWorkspaceRole = useUpdateUserWorkspaceRole();

  const isOwnProjectMembershipDetails = userId === membershipDetails?.user?.id;
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;

  const handleRoleDelete = async () => {
    const { id } = popUp?.deleteRole?.data as TProjectRole;
    const updatedRoles = membershipDetails?.roles?.filter((el) => el.id !== id);
    await updateUserWorkspaceRole.mutateAsync({
      projectId,
      projectType: currentProject?.type,
      roles: updatedRoles.map(
        ({
          role,
          customRoleSlug,
          isTemporary,
          temporaryMode,
          temporaryRange,
          temporaryAccessStartTime,
          temporaryAccessEndTime
        }) => ({
          role: role === "custom" ? customRoleSlug : role,
          ...(isTemporary
            ? {
                isTemporary,
                temporaryMode,
                temporaryRange,
                temporaryAccessStartTime,
                temporaryAccessEndTime
              }
            : {
                isTemporary
              })
        })
      ),
      membershipId: isCertManager ? membershipDetails.user.id : membershipDetails.id
    });
    createNotification({ type: "success", text: "Successfully removed role" });
    setDeleteRoleConfirmation("");
    handlePopUpClose("deleteRole");
  };

  const hasRoles = Boolean(membershipDetails?.roles.length);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{isCertManager ? "Roles" : "Project Roles"}</CardTitle>
          <CardDescription>Manage roles assigned to this user</CardDescription>
          {!isOwnProjectMembershipDetails && hasRoles && (
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.Member}
              >
                {(isAllowed) => {
                  const isEditDisabled = !isAllowed || !canModifyMemberRoles;
                  const button = (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        handlePopUpOpen("modifyManyRoles");
                      }}
                      isDisabled={isEditDisabled}
                    >
                      <PencilIcon />
                      Edit Roles
                    </Button>
                  );
                  return isEditDisabled ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block">{button}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        You don&apos;t have permission to edit this user&apos;s roles
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
          {
            /* eslint-disable-next-line no-nested-ternary */
            isMembershipDetailsLoading ? (
              <div className="h-40 w-full">
                <PageLoader lottieClassName="w-16" />
              </div>
            ) : hasRoles ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/2">Role</TableHead>
                    <TableHead className="w-1/2">Duration</TableHead>
                    {!isOwnProjectMembershipDetails && <TableHead className="w-5" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {membershipDetails?.roles?.map((roleDetails) => {
                    const isTemporary = roleDetails?.isTemporary;
                    const isExpired =
                      roleDetails.isTemporary &&
                      new Date() > new Date(roleDetails.temporaryAccessEndTime || "");

                    const navigateToRole = () =>
                      navigate({
                        to: `${getProjectBaseURL(currentProject.type)}/roles/$roleSlug`,
                        params: {
                          projectId: currentProject.id,
                          roleSlug:
                            roleDetails.role === "custom"
                              ? roleDetails.customRoleSlug
                              : roleDetails.role
                        }
                      });

                    let text = "Permanent";
                    let toolTipText = "Non-Expiring Access";
                    if (roleDetails.isTemporary) {
                      if (isExpired) {
                        text = "Access Expired";
                        toolTipText = "Timed Access Expired";
                      } else {
                        text = formatDistance(
                          new Date(roleDetails.temporaryAccessEndTime || ""),
                          new Date()
                        );
                        toolTipText = `Until ${format(
                          new Date(roleDetails.temporaryAccessEndTime || ""),
                          "yyyy-MM-dd hh:mm:ss aaa"
                        )}`;
                      }
                    }

                    return (
                      <TableRow
                        className={`group h-10 ${isCertManager ? "" : "cursor-pointer"}`}
                        key={`user-project-identity-${roleDetails?.id}`}
                        role={isCertManager ? undefined : "link"}
                        tabIndex={isCertManager ? undefined : 0}
                        onKeyDown={(event) => {
                          if (!isCertManager && event.key === "Enter") navigateToRole();
                        }}
                        onClick={isCertManager ? undefined : navigateToRole}
                      >
                        <TableCell className="max-w-0 truncate">
                          {roleDetails.role === "custom"
                            ? roleDetails.customRoleName
                            : formatProjectRoleName(roleDetails.role)}
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
                                  aria-label="Open role actions"
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                >
                                  <EllipsisIcon />
                                </IconButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Edit}
                                  a={ProjectPermissionSub.Member}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePopUpOpen("modifyRole", roleDetails);
                                      }}
                                      isDisabled={!isAllowed || !canModifyMemberRoles}
                                    >
                                      Modify Role
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Edit}
                                  a={ProjectPermissionSub.Member}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePopUpOpen("deleteRole", {
                                          id: roleDetails?.id,
                                          slug: roleDetails?.customRoleName || roleDetails?.role
                                        });
                                      }}
                                      isDisabled={!isAllowed || !canModifyMemberRoles}
                                      variant="danger"
                                    >
                                      Remove Role
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
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
                  <EmptyTitle>This user doesn&apos;t have any roles</EmptyTitle>
                  <EmptyDescription>Give this user one or more roles</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Edit}
                    a={ProjectPermissionSub.Member}
                  >
                    {(isAllowed) => {
                      const isEditDisabled =
                        !isAllowed || isOwnProjectMembershipDetails || !canModifyMemberRoles;
                      const button = (
                        <Button
                          variant="project"
                          size="xs"
                          onClick={() => {
                            handlePopUpOpen("modifyManyRoles");
                          }}
                          isDisabled={isEditDisabled}
                        >
                          <PencilIcon />
                          Edit Roles
                        </Button>
                      );
                      return isEditDisabled ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-block">{button}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            You don&apos;t have permission to edit this user&apos;s roles
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        button
                      );
                    }}
                  </ProjectPermissionCan>
                </EmptyContent>
              </Empty>
            )
          }
        </CardContent>
      </Card>

      <AlertDialog
        open={popUp.deleteRole.isOpen}
        onOpenChange={(isOpen) => {
          if (updateUserWorkspaceRole.isPending) return;
          if (!isOpen) setDeleteRoleConfirmation("");
          handlePopUpToggle("deleteRole", isOpen);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove role &quot;{(popUp?.deleteRole?.data as TProjectRole)?.slug}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This role will no longer grant access to this user.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="remove-member-role-confirmation">
              Type &quot;remove&quot; to confirm
            </FieldLabel>
            <Input
              id="remove-member-role-confirmation"
              value={deleteRoleConfirmation}
              onChange={(event) => setDeleteRoleConfirmation(event.target.value)}
              autoComplete="off"
              disabled={updateUserWorkspaceRole.isPending}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={updateUserWorkspaceRole.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={updateUserWorkspaceRole.isPending}
              isDisabled={deleteRoleConfirmation !== "remove"}
              onClick={(event) => {
                event.preventDefault();
                handleRoleDelete().catch(() => undefined);
              }}
            >
              Remove Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Sheet
        open={popUp.modifyManyRoles.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("modifyManyRoles", isOpen)}
      >
        <SheetContent className="flex flex-col gap-0 sm:max-w-xl">
          <SheetHeader className="border-b">
            <SheetTitle>Roles</SheetTitle>
            <SheetDescription>
              Select one or more of the pre-defined or custom roles to configure project
              permissions.
            </SheetDescription>
          </SheetHeader>
          <MemberMultiRoleModify
            projectMember={membershipDetails}
            onOpenUpgradeModal={onOpenUpgradeModal}
            onClose={() => handlePopUpClose("modifyManyRoles")}
          />
        </SheetContent>
      </Sheet>
      <Dialog
        open={popUp.modifyRole.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("modifyRole", isOpen)}
      >
        <DialogContent className="overflow-visible sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>
              Update this role assignment and its access duration.
            </DialogDescription>
          </DialogHeader>
          {popUp.modifyRole.data && (
            <MemberSingleRoleModify
              projectMember={membershipDetails}
              role={popUp.modifyRole.data as TWorkspaceUser["roles"][number]}
              onOpenUpgradeModal={onOpenUpgradeModal}
              onSuccess={() => handlePopUpClose("modifyRole")}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
