import { useMemo } from "react";
import { subject } from "@casl/ability";
import { useNavigate } from "@tanstack/react-router";
import { format, formatDistance } from "date-fns";
import { ClockAlertIcon, ClockIcon, EllipsisIcon, PencilIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
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
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { formatProjectRoleName } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";
import { useUpdateProjectIdentityMembership } from "@app/hooks/api";
import { IdentityProjectMembershipV1 } from "@app/hooks/api/identities/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { TProjectRole } from "@app/hooks/api/roles/types";
import {
  canModifyByGrantConditions,
  getIdentityAssignRoleConditions
} from "@app/lib/fn/permission";

import { IdentityActionConfirmationDialog } from "../IdentityActionConfirmationDialog";
import { IdentityRoleModify } from "./IdentityRoleModify";

type Props = {
  identityMembershipDetails: IdentityProjectMembershipV1;
  isMembershipDetailsLoading?: boolean;
};

export const IdentityRoleDetailsSection = ({
  identityMembershipDetails,
  isMembershipDetailsLoading
}: Props) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const navigate = useNavigate();
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deleteRole",
    "modifyRole"
  ] as const);
  const { mutateAsync: updateIdentityProjectMembership } = useUpdateProjectIdentityMembership();

  const assignRoleConditions = useMemo(
    () => getIdentityAssignRoleConditions(permission),
    [permission]
  );

  const canModifyIdentityRoles = useMemo(() => {
    const targetIdentityId = identityMembershipDetails?.identity?.id;
    if (!targetIdentityId) return false;

    return canModifyByGrantConditions({
      targetValue: targetIdentityId,
      allowed: assignRoleConditions?.identityIds,
      forbidden: assignRoleConditions?.forbiddenIdentityIds
    });
  }, [assignRoleConditions, identityMembershipDetails?.identity?.id]);

  const handleRoleDelete = async () => {
    const { id } = popUp?.deleteRole?.data as TProjectRole;
    const updatedRoles = identityMembershipDetails?.roles?.filter((el) => el.id !== id);
    await updateIdentityProjectMembership({
      projectId: currentProject?.id || "",
      projectType: currentProject?.type,
      identityId: identityMembershipDetails.identity.id,
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
      )
    });
    createNotification({ type: "success", text: "Successfully removed role" });
    handlePopUpClose("deleteRole");
  };

  const hasRoles = Boolean(identityMembershipDetails?.roles.length);
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;
  const isPam = currentProject?.type === ProjectType.PAM;
  // Products where the underlying project is an internal detail the user never sees
  const isStandaloneProduct = isCertManager || isPam;
  // PAM has a single built-in product role edited from its own Access Control page; the generic
  // multi-role editor (custom roles, temporary access) doesn't apply, so the card is read-only here.
  const isRoleEditable = !isPam;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{isStandaloneProduct ? "Roles" : "Project Roles"}</CardTitle>
          <CardDescription>Manage roles assigned to this machine identity</CardDescription>
          {hasRoles && isRoleEditable && (
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={subject(ProjectPermissionSub.Identity, {
                  identityId: identityMembershipDetails.identity.id
                })}
              >
                {(isAllowed) => {
                  const isEditDisabled = !isAllowed || !canModifyIdentityRoles;
                  const button = (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        handlePopUpOpen("modifyRole");
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
                        You don&apos;t have permission to edit this identity&apos;s roles
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
              <div className="h-40">
                <PageLoader lottieClassName="w-16" />
              </div>
            ) : hasRoles ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/2">Role</TableHead>
                    <TableHead className="w-1/2">Duration</TableHead>
                    <TableHead className="w-5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {identityMembershipDetails?.roles?.map((roleDetails) => {
                    const roleSlug =
                      roleDetails.role === "custom" ? roleDetails.customRoleSlug : roleDetails.role;
                    const isTemporary = roleDetails?.isTemporary;
                    const isExpired =
                      roleDetails.isTemporary &&
                      new Date() > new Date(roleDetails.temporaryAccessEndTime || "");

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
                        key={`user-project-identity-${roleDetails?.id}`}
                        className={isStandaloneProduct ? "" : "cursor-pointer"}
                        role={isStandaloneProduct ? undefined : "button"}
                        tabIndex={isStandaloneProduct ? undefined : 0}
                        onKeyDown={(event) => {
                          if (
                            isStandaloneProduct ||
                            event.target !== event.currentTarget ||
                            (event.key !== "Enter" && event.key !== " ")
                          ) {
                            return;
                          }
                          event.preventDefault();
                          navigate({
                            to: `${getProjectBaseURL(currentProject.type)}/roles/$roleSlug`,
                            params: {
                              projectId: currentProject.id,
                              roleSlug
                            }
                          });
                        }}
                        onClick={
                          isStandaloneProduct
                            ? undefined
                            : () =>
                                navigate({
                                  to: `${getProjectBaseURL(currentProject.type)}/roles/$roleSlug`,
                                  params: {
                                    projectId: currentProject.id,
                                    roleSlug
                                  }
                                })
                        }
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
                        <TableCell>
                          {isRoleEditable && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <IconButton
                                  aria-label={`Open actions for ${
                                    roleDetails.role === "custom"
                                      ? roleDetails.customRoleName
                                      : formatProjectRoleName(roleDetails.role)
                                  } role`}
                                  size="xs"
                                  variant="ghost"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <EllipsisIcon />
                                </IconButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Edit}
                                  a={subject(ProjectPermissionSub.Identity, {
                                    identityId: identityMembershipDetails.identity.id
                                  })}
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
                                      isDisabled={!isAllowed || !canModifyIdentityRoles}
                                      variant="danger"
                                    >
                                      Remove Role
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>This machine identity doesn&apos;t have any roles</EmptyTitle>
                  <EmptyDescription>Give this machine identity one or more roles</EmptyDescription>
                </EmptyHeader>
                {isRoleEditable && (
                  <EmptyContent>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={subject(ProjectPermissionSub.Identity, {
                        identityId: identityMembershipDetails.identity.id
                      })}
                    >
                      {(isAllowed) => {
                        const isEditDisabled = !isAllowed || !canModifyIdentityRoles;
                        const button = (
                          <Button
                            variant="project"
                            size="xs"
                            onClick={() => {
                              handlePopUpOpen("modifyRole");
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
                              You don&apos;t have permission to edit this identity&apos;s roles
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
            )
          }
        </CardContent>
      </Card>
      <IdentityActionConfirmationDialog
        open={popUp.deleteRole.isOpen}
        confirmationText="remove"
        title={`Remove role ${(popUp?.deleteRole?.data as TProjectRole)?.slug || ""}?`}
        description="The machine identity will lose the permissions granted by this role."
        actionLabel="Remove Role"
        onOpenChange={(isOpen) => handlePopUpToggle("deleteRole", isOpen)}
        onConfirm={handleRoleDelete}
      />
      <Sheet
        open={popUp.modifyRole.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("modifyRole", isOpen)}
      >
        <SheetContent className="flex flex-col gap-0 sm:max-w-xl">
          <SheetHeader className="border-b">
            <SheetTitle>Roles</SheetTitle>
            <SheetDescription>
              {isStandaloneProduct
                ? "Select one or more of the pre-defined roles to configure access."
                : "Select one or more of the pre-defined or custom roles to configure project permissions."}
            </SheetDescription>
          </SheetHeader>
          <IdentityRoleModify
            identityProjectMembership={identityMembershipDetails}
            onClose={() => handlePopUpClose("modifyRole")}
          />
        </SheetContent>
      </Sheet>
    </>
  );
};
