import { faUserMinus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { IconButton, Td, Tooltip, Tr } from "@app/components/v2";
import { OrgPermissionGroupActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useOidcManageGroupMembershipsEnabled } from "@app/hooks/api";
import { TGroupUser } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  user: TGroupUser;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeMemberFromGroup"]>,
    data?: object
  ) => void;
};

export const GroupMembershipRow = ({
  user: { firstName, lastName, username, joinedGroupAt, email, id },
  handlePopUpOpen
}: Props) => {
  const { currentOrg } = useOrganization();

  const { data: isOidcManageGroupMembershipsEnabled = false } =
    useOidcManageGroupMembershipsEnabled(currentOrg.id);

  return (
    <Tr className="items-center" key={`group-user-${id}`}>
      <Td>
        <p>{`${firstName ?? "-"} ${lastName ?? ""}`}</p>
      </Td>
      <Td>
        <p>{email}</p>
      </Td>
      <Td>
        <Tooltip content={new Date(joinedGroupAt).toLocaleString()}>
          <p>{new Date(joinedGroupAt).toLocaleDateString()}</p>
        </Tooltip>
      </Td>
      <Td className="justify-end">
        <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
          {(isAllowed) => {
            return (
              <Tooltip
                content={
                  isOidcManageGroupMembershipsEnabled
                    ? "OIDC Group Membership Mapping Enabled. Remove user from this group in your OIDC provider."
                    : "Remove user from group"
                }
              >
                <IconButton
                  isDisabled={!isAllowed || isOidcManageGroupMembershipsEnabled}
                  ariaLabel="Remove user from group"
                  onClick={() => handlePopUpOpen("removeMemberFromGroup", { username })}
                  variant="plain"
                  colorSchema="danger"
                >
                  <FontAwesomeIcon icon={faUserMinus} />
                </IconButton>
              </Tooltip>
            );
          }}
        </OrgPermissionCan>
      </Td>
    </Tr>
  );
};
