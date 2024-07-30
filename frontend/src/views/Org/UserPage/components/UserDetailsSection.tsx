import {
  faCheck,
  faCheckCircle,
  faCircleXmark,
  faCopy,
  faPencil
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, IconButton, Tooltip } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useUser
} from "@app/context";
import { useTimedReset } from "@app/hooks";
import {
  useAddUserToOrg,
  useFetchServerStatus,
  useGetOrgMembership,
  useGetOrgRoles
} from "@app/hooks/api";
import { OrgUser } from "@app/hooks/api/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  membershipId: string;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["orgMembership"]>, data?: {}) => void;
};

export const UserDetailsSection = ({ membershipId, handlePopUpOpen }: Props) => {
  const [copyTextUsername, isCopyingUsername, setCopyTextUsername] = useTimedReset<string>({
    initialState: "Copy username to clipboard"
  });

  const { user } = useUser();
  const { currentOrg } = useOrganization();
  const userId = user?.id || "";
  const orgId = currentOrg?.id || "";

  const { data: roles } = useGetOrgRoles(orgId);
  const { data: serverDetails } = useFetchServerStatus();
  const { data: membership } = useGetOrgMembership(orgId, membershipId);
  const { mutateAsync: inviteUser, isLoading } = useAddUserToOrg();

  const onResendInvite = async (email: string) => {
    try {
      const { data } = await inviteUser({
        organizationId: orgId,
        inviteeEmail: email
      });

      //   setCompleteInviteLink(data?.completeInviteLink || "");

      if (!data.completeInviteLink) {
        createNotification({
          text: `Successfully resent invite to ${email}`,
          type: "success"
        });
      }
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to resend invite to ${email}`,
        type: "error"
      });
    }
  };

  const getStatus = (m: OrgUser) => {
    if (!m.isActive) {
      return "Deactivated";
    }

    return m.status === "invited" ? "Invited" : "Active";
  };

  const roleName = roles?.find((r) => r.slug === membership?.role)?.name;

  return membership ? (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">User Details</h3>
        {userId !== membership.user.id && (
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Identity}>
            {(isAllowed) => {
              return (
                <Tooltip content="Edit Membership">
                  <IconButton
                    isDisabled={!isAllowed}
                    ariaLabel="copy icon"
                    variant="plain"
                    className="group relative"
                    onClick={() => {
                      handlePopUpOpen("orgMembership", {
                        membershipId: membership.id,
                        role: membership.role
                      });
                    }}
                  >
                    <FontAwesomeIcon icon={faPencil} />
                  </IconButton>
                </Tooltip>
              );
            }}
          </OrgPermissionCan>
        )}
      </div>
      <div className="pt-4">
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Name</p>
          <p className="text-sm text-mineshaft-300">
            {membership.user.firstName || membership.user.lastName
              ? `${membership.user.firstName} ${membership.user.lastName}`
              : "-"}
          </p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Username</p>
          <div className="group flex align-top">
            <p className="text-sm text-mineshaft-300">{membership.user.username}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={copyTextUsername}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText("");
                    setCopyTextUsername("Copied");
                  }}
                >
                  <FontAwesomeIcon icon={isCopyingUsername ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Email</p>
          <div className="flex items-center">
            <p className="mr-2 text-sm text-mineshaft-300">{membership.user.email ?? "-"}</p>
            <Tooltip
              content={
                membership.user.isEmailVerified
                  ? "Email has been verified"
                  : "Email has not been verified"
              }
            >
              <FontAwesomeIcon
                size="sm"
                icon={membership.user.isEmailVerified ? faCheckCircle : faCircleXmark}
              />
            </Tooltip>
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Organization Role</p>
          <p className="text-sm text-mineshaft-300">{roleName ?? "-"}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-mineshaft-300">Status</p>
          <p className="text-sm text-mineshaft-300">{getStatus(membership)}</p>
        </div>
        {membership.isActive &&
          (membership.status === "invited" || membership.status === "verified") &&
          membership.user.email &&
          serverDetails?.emailConfigured && (
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Identity}>
              {(isAllowed) => {
                return (
                  <Button
                    isDisabled={!isAllowed}
                    className="mt-4 w-full"
                    colorSchema="primary"
                    type="submit"
                    isLoading={isLoading}
                    onClick={() => {
                      onResendInvite(membership.user.email as string);
                    }}
                  >
                    Resend Invite
                  </Button>
                );
              }}
            </OrgPermissionCan>
          )}
      </div>
    </div>
  ) : (
    <div />
  );
};
