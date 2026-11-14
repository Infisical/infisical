import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BanIcon, TrashIcon, UserPlusIcon } from "lucide-react";

import { EmailServiceSetupModal } from "@app/components/auth/EmailServiceSetupModal";
import { CustomRolesUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
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
  SelectedActionBar,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ConfirmationAlertDialog } from "@app/components/v3/platform";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects,
  useOrganization,
  useUser
} from "@app/context";
import {
  useDeleteOrgMembership,
  useGetOrgUserAccess,
  useUpdateOrgMembership
} from "@app/hooks/api";
import { useDeleteOrgMembershipBatch } from "@app/hooks/api/users/queries";
import { TOrgUserAccess } from "@app/hooks/api/users/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddOrgMemberModal } from "./AddOrgMemberModal";
import { AddSubOrgMemberModal } from "./AddSubOrgMemberModal";
import { OrgMembersTable } from "./OrgMembersTable";

export const OrgMembersSection = () => {
  const { currentOrg, isSubOrganization } = useOrganization();
  const navigate = useNavigate();
  const orgId = currentOrg?.id ?? "";
  const { user } = useUser();
  const userId = user?.id || "";
  const [completeInviteLinks, setCompleteInviteLinks] = useState<Array<{
    email: string;
    link: string;
  }> | null>(null);

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addMember",
    "addMemberToSubOrg",
    "removeMember",
    "deactivateMember",
    "upgradePlan",
    "setUpEmail",
    "removeMembers"
  ] as const);

  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const urlAction = useSearch({
    from: ROUTE_PATHS.Organization.AccessControlPage.id,
    select: (el) => el.action,
    structuralSharing: true
  });

  useEffect(() => {
    if (urlAction === "invite-members") {
      handlePopUpOpen("addMember");
      navigate({
        to: ".",
        search: ({ action, ...search }) => search
      });
    }
  }, [urlAction]);

  const { mutateAsync: deleteMutateAsync } = useDeleteOrgMembership();
  const { mutateAsync: deleteBatchMutateAsync } = useDeleteOrgMembershipBatch();
  const { mutateAsync: updateOrgMembership } = useUpdateOrgMembership();

  const handleAddMemberModal = () => {
    handlePopUpOpen("addMember");
  };

  const onDeactivateMemberSubmit = async (orgMembershipId: string) => {
    await updateOrgMembership({
      organizationId: orgId,
      membershipId: orgMembershipId,
      isActive: false
    });

    createNotification({
      text: "Successfully deactivated user in organization",
      type: "success"
    });

    handlePopUpClose("deactivateMember");
  };

  const onRemoveMemberSubmit = async (orgMembershipId: string) => {
    await deleteMutateAsync({
      orgId,
      membershipId: orgMembershipId
    });

    createNotification({
      text: "Successfully removed user from org",
      type: "success"
    });

    handlePopUpClose("removeMember");
  };

  const { data: members = [] } = useGetOrgUserAccess(orgId);
  const membersToRemove = (popUp.removeMembers.data?.selectedOrgMemberships ??
    []) as TOrgUserAccess[];

  const handleRemoveMembers = async (selectedMembers: TOrgUserAccess[]) => {
    await deleteBatchMutateAsync({
      orgId,
      membershipIds: selectedMembers.flatMap((member) =>
        member.membership && member.user.id !== userId ? [member.membership.id] : []
      )
    });

    createNotification({
      text: "Successfully removed users from organization",
      type: "success"
    });

    setSelectedMemberIds([]);
    handlePopUpClose("removeMembers");
  };

  return (
    <>
      <SelectedActionBar
        selectedCount={selectedMemberIds.length}
        onClearSelection={() => setSelectedMemberIds([])}
      >
        <OrgPermissionCan
          I={OrgPermissionMemberActions.Delete}
          a={OrgPermissionSubjects.Member}
          renderTooltip
        >
          {(isAllowed) => (
            <Button
              variant="danger"
              onClick={() => {
                const selectedOrgMemberships = members.filter(
                  (member) => member.membership && selectedMemberIds.includes(member.membership.id)
                );

                if (!selectedOrgMemberships.length) return;

                handlePopUpOpen("removeMembers", { selectedOrgMemberships });
              }}
              isDisabled={!isAllowed}
              size="xs"
            >
              <TrashIcon />
              Delete
            </Button>
          )}
        </OrgPermissionCan>
      </SelectedActionBar>
      <Card>
        <CardHeader>
          <CardTitle>
            {isSubOrganization ? "Sub-" : ""}Organization Users
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/identities/user-identities" />
          </CardTitle>
          <CardDescription>
            Invite and manage {isSubOrganization ? "sub-" : ""}organization users
          </CardDescription>
          <CardAction>
            <OrgPermissionCan
              I={OrgPermissionMemberActions.Create}
              a={OrgPermissionSubjects.Member}
            >
              {(isAllowed) => (
                <Button
                  variant={isSubOrganization ? "sub-org" : "org"}
                  type="submit"
                  onClick={() =>
                    isSubOrganization
                      ? handlePopUpOpen("addMemberToSubOrg")
                      : handleAddMemberModal()
                  }
                  isDisabled={!isAllowed}
                >
                  <UserPlusIcon />
                  {isSubOrganization ? "Add" : "Invite"}
                </Button>
              )}
            </OrgPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <OrgMembersTable
            handlePopUpOpen={handlePopUpOpen}
            setCompleteInviteLinks={setCompleteInviteLinks}
            selectedMemberIds={selectedMemberIds}
            setSelectedMemberIds={setSelectedMemberIds}
          />
        </CardContent>
      </Card>
      <AddOrgMemberModal
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
        completeInviteLinks={completeInviteLinks}
        setCompleteInviteLinks={setCompleteInviteLinks}
      />
      <AddSubOrgMemberModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <ConfirmationAlertDialog
        isOpen={popUp.removeMember.isOpen}
        title={`Are you sure you want to remove member with username ${
          (popUp?.removeMember?.data as { username: string })?.username || ""
        }?`}
        description="This action is irreversible."
        onOpenChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
        confirmKey="confirm"
        onConfirm={() =>
          onRemoveMemberSubmit(
            (popUp?.removeMember?.data as { orgMembershipId: string })?.orgMembershipId
          )
        }
      />
      <ConfirmationAlertDialog
        isOpen={popUp.deactivateMember.isOpen}
        title={`Are you sure you want to deactivate member with username ${
          (popUp?.deactivateMember?.data as { username: string })?.username || ""
        }?`}
        description="This action is irreversible."
        onOpenChange={(isOpen) => handlePopUpToggle("deactivateMember", isOpen)}
        confirmKey="confirm"
        onConfirm={() =>
          onDeactivateMemberSubmit(
            (popUp?.deactivateMember?.data as { orgMembershipId: string })?.orgMembershipId
          )
        }
        confirmLabel="Deactivate"
      />
      <ConfirmationAlertDialog
        isOpen={popUp.removeMembers.isOpen}
        title="Are you sure you want to remove the following members?"
        description="This action is irreversible."
        onOpenChange={(isOpen) => handlePopUpToggle("removeMembers", isOpen)}
        confirmKey="confirm"
        onConfirm={() => handleRemoveMembers(membersToRemove)}
        confirmLabel="Remove"
      >
        <div className="text-sm text-muted">
          The following members will be removed:
          <div className="mt-2 max-h-80 overflow-y-auto rounded-sm border border-border-control bg-danger/10 p-4 pl-8 text-sm text-danger">
            <ul className="list-disc">
              {membersToRemove.map((member) => {
                const email =
                  member.user.email ?? member.user.username ?? member.membership?.inviteEmail;
                return (
                  <li key={member.user.id}>
                    <div className="flex items-center">
                      <p className={userId === member.user.id ? "line-through" : ""}>
                        {member.user.firstName || member.user.lastName ? (
                          <>
                            {`${`${member.user.firstName ?? ""} ${member.user.lastName ?? ""}`.trim()} `}
                            (<span className="break-all">{email}</span>)
                          </>
                        ) : (
                          <span className="break-all">{email}</span>
                        )}{" "}
                      </p>
                      {userId === member.user.id && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="danger" className="ml-2">
                              <BanIcon />
                              Ignored
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            You cannot remove yourself from this organization
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </ConfirmationAlertDialog>
      <UpgradeGate
        paywallKey="organization.org-members"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        intent={{
          ...CustomRolesUpgradeIntent,
          isEnterpriseFeature: Boolean(popUp.upgradePlan?.data?.isEnterpriseFeature)
        }}
      />
      <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
      />
    </>
  );
};
