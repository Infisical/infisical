import { useMemo, useRef } from "react";
import { subject } from "@casl/ability";
import { format, formatDistance } from "date-fns";
import { ClockAlertIcon, ClockIcon, EllipsisIcon, PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Lottie } from "@app/components/v2";
import {
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
  IconButton,
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
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteIdentityProjectAdditionalPrivilege } from "@app/hooks/api";
import { IdentityProjectMembershipV1 } from "@app/hooks/api/identities/types";
import { useListIdentityProjectPrivileges } from "@app/hooks/api/identityProjectAdditionalPrivilege/queries";
import {
  canModifyByGrantConditions,
  getIdentityAssignPrivilegesConditions
} from "@app/lib/fn/permission";

import { IdentityProjectAdditionalPrivilegeModifySection } from "./IdentityProjectAdditionalPrivilegeModifySection";

type Props = {
  identityMembershipDetails: IdentityProjectMembershipV1;
};

export const IdentityProjectAdditionalPrivilegeSection = ({ identityMembershipDetails }: Props) => {
  const sheetContainerRef = useRef<HTMLDivElement>(null);
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deletePrivilege",
    "modifyPrivilege"
  ] as const);
  const { permission } = useProjectPermission();
  const identityId = identityMembershipDetails?.identity?.id;
  const { projectId } = useProject();

  const { mutateAsync: deletePrivilege } = useDeleteIdentityProjectAdditionalPrivilege();

  const { data: identityProjectPrivileges, isPending } = useListIdentityProjectPrivileges({
    identityId: identityMembershipDetails?.identity?.id,
    projectId
  });

  const assignPrivilegesConditions = useMemo(
    () => getIdentityAssignPrivilegesConditions(permission),
    [permission]
  );

  const canModifyIdentityPrivileges = useMemo(() => {
    const targetIdentityId = identityMembershipDetails?.identity?.id;
    if (!targetIdentityId) return false;

    return canModifyByGrantConditions({
      targetValue: targetIdentityId,
      allowed: assignPrivilegesConditions?.identityIds,
      forbidden: assignPrivilegesConditions?.forbiddenIdentityIds
    });
  }, [assignPrivilegesConditions, identityMembershipDetails?.identity?.id]);

  const handlePrivilegeDelete = async () => {
    const { id } = popUp?.deletePrivilege?.data as { id: string };
    await deletePrivilege({
      privilegeId: id,
      projectId,
      identityId
    });
    createNotification({ type: "success", text: "Successfully removed the privilege" });
    handlePopUpClose("deletePrivilege");
  };

  const hasAdditionalPrivileges = Boolean(identityProjectPrivileges?.length);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Project Additional Privileges
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/access-controls/additional-privileges#api" />
          </CardTitle>
          <CardDescription>Assign one-off policies to this machine identity</CardDescription>
          {hasAdditionalPrivileges && (
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={subject(ProjectPermissionSub.Identity, {
                  identityId
                })}
              >
                {(isAllowed) => {
                  const isEditDisabled = !isAllowed || !canModifyIdentityPrivileges;
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
                        You don&apos;t have permission to edit this identity&apos;s privileges
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
          {/* eslint-disable-next-line no-nested-ternary */}
          {isPending ? (
            // scott: todo proper loader
            <div className="flex h-40 w-full items-center justify-center">
              <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
            </div>
          ) : identityProjectPrivileges?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/2">Name</TableHead>
                  <TableHead className="w-1/2">Duration</TableHead>
                  <TableHead className="w-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isPending &&
                  identityProjectPrivileges?.map((privilegeDetails) => {
                    const isTemporary = privilegeDetails?.isTemporary;
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
                        <TableCell className="max-w-0 truncate">{privilegeDetails.slug}</TableCell>
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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton size="xs" variant="ghost">
                                <EllipsisIcon />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <ProjectPermissionCan
                                I={ProjectPermissionActions.Edit}
                                a={subject(ProjectPermissionSub.Identity, {
                                  identityId
                                })}
                                renderTooltip
                                allowedLabel="Remove Role"
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    isDisabled={!isAllowed || !canModifyIdentityPrivileges}
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
                                a={subject(ProjectPermissionSub.Identity, {
                                  identityId
                                })}
                                renderTooltip
                                allowedLabel="Remove Role"
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    isDisabled={!isAllowed || !canModifyIdentityPrivileges}
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
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>This machine identity has no additional privileges</EmptyTitle>
                <EmptyDescription>
                  Add an additional privilege to grant one-off access policies
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={subject(ProjectPermissionSub.Identity, {
                    identityId
                  })}
                >
                  {(isAllowed) => {
                    const isEditDisabled = !isAllowed || !canModifyIdentityPrivileges;
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
                          You don&apos;t have permission to edit this identity&apos;s privileges
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      button
                    );
                  }}
                </ProjectPermissionCan>
              </EmptyContent>
            </Empty>
          )}
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
          <IdentityProjectAdditionalPrivilegeModifySection
            onGoBack={() => handlePopUpClose("modifyPrivilege")}
            identityId={identityId}
            privilegeId={(popUp?.modifyPrivilege?.data as { id: string })?.id}
            isDisabled={
              permission.cannot(
                ProjectPermissionIdentityActions.Edit,
                subject(ProjectPermissionSub.Identity, {
                  identityId
                })
              ) || !canModifyIdentityPrivileges
            }
            menuPortalContainerRef={sheetContainerRef}
          />
        </SheetContent>
      </Sheet>
      <DeleteActionModal
        isOpen={popUp.deletePrivilege.isOpen}
        deleteKey="remove"
        title={`Do you want to remove privilege ${
          (popUp?.deletePrivilege?.data as { slug: string; id: string })?.slug
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deletePrivilege", isOpen)}
        onDeleteApproved={() => handlePrivilegeDelete()}
      />
    </>
  );
};
