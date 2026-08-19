import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BanIcon, TrashIcon, UserPlusIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, EmailServiceSetupModal, Tooltip } from "@app/components/v2";
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
  SelectedActionBar
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription,
  useUser
} from "@app/context";
import { useDeleteOrgMembership, useGetOrgUsers, useUpdateOrgMembership } from "@app/hooks/api";
import { SubscriptionPlanTypes } from "@app/hooks/api/subscriptions/types";
import { useDeleteOrgMembershipBatch } from "@app/hooks/api/users/queries";
import { OrgUser } from "@app/hooks/api/users/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddOrgMemberModal } from "./AddOrgMemberModal";
import { AddSubOrgMemberModal } from "./AddSubOrgMemberModal";
import { OrgMembersTable } from "./OrgMembersTable";

export const OrgMembersSection = () => {
  const { subscription } = useSubscription();
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

  const isMoreIdentitiesAllowed = subscription?.identityLimit
    ? subscription.identitiesUsed < subscription.identityLimit
    : true;

  const isEnterprise = subscription?.slug === SubscriptionPlanTypes.Enterprise;

  const handleAddMemberModal = () => {
    if (!isMoreIdentitiesAllowed && !isEnterprise) {
      handlePopUpOpen("upgradePlan", {
        text: "You have reached the maximum number of members allowed on your current plan. Upgrade to Infisical Pro plan to add more members."
      });
      return;
    }

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

  const { data: members = [] } = useGetOrgUsers(orgId);

  const handleRemoveMembers = async (selectedMembers: OrgUser[]) => {
    await deleteBatchMutateAsync({
      orgId,
      membershipIds: selectedMembers
        .filter((member) => member.user.id !== userId)
        .map((member) => member.id)
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
          I={OrgPermissionActions.Delete}
          a={OrgPermissionSubjects.Member}
          renderTooltip
        >
          {(isAllowed) => (
            <Button
              variant="danger"
              onClick={() => {
                const selectedOrgMemberships = members.filter((member) =>
                  selectedMemberIds.includes(member.id)
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
            <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Member}>
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
      <DeleteActionModal
        isOpen={popUp.removeMember.isOpen}
        title={`Are you sure you want to remove member with username ${
          (popUp?.removeMember?.data as { username: string })?.username || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveMemberSubmit(
            (popUp?.removeMember?.data as { orgMembershipId: string })?.orgMembershipId
          )
        }
      />
      <DeleteActionModal
        isOpen={popUp.deactivateMember.isOpen}
        title={`Are you sure you want to deactivate member with username ${
          (popUp?.deactivateMember?.data as { username: string })?.username || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deactivateMember", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onDeactivateMemberSubmit(
            (popUp?.deactivateMember?.data as { orgMembershipId: string })?.orgMembershipId
          )
        }
        buttonText="Deactivate"
      />
      <DeleteActionModal
        isOpen={popUp.removeMembers.isOpen}
        title="Are you sure you want to remove the following members?"
        onChange={(isOpen) => handlePopUpToggle("removeMembers", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          handleRemoveMembers(popUp.removeMembers.data.selectedOrgMemberships as OrgUser[])
        }
        buttonText="Remove"
      >
        <div className="mt-4 text-sm text-muted">The following members will be removed:</div>
        <div className="mt-2 max-h-80 overflow-y-auto rounded-sm border border-border bg-danger/10 p-4 pl-8 text-sm text-danger">
          <ul className="list-disc">
            {(popUp.removeMembers.data?.selectedOrgMemberships as OrgUser[])?.map((member) => {
              const email = member.user.email ?? member.user.username ?? member.inviteEmail;
              return (
                <li key={member.id}>
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
                      <Tooltip content="You cannot remove yourself from this organization">
                        <Badge variant="danger" className="ml-2">
                          <BanIcon />
                          Ignored
                        </Badge>
                      </Tooltip>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </DeleteActionModal>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={popUp.upgradePlan?.data?.text}
        isEnterpriseFeature={popUp.upgradePlan?.data?.isEnterpriseFeature}
      />
      <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
      />
    </>
  );
};
