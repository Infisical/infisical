import { faCheck, faCopy, faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { IconButton, Tooltip } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects,useOrganization } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { useGetOrgRole } from "@app/hooks/api";
// import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  roleId: string;
  //   handlePopUpOpen: (popUpName: keyof UsePopUpState<[]>, data?: {}) => void;
};

export const RoleDetailsSection = ({ roleId }: Props) => {
  const [copyTextId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { data } = useGetOrgRole(orgId, roleId);

  console.log("useGetOrgRole data: ", data);

  return data ? (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Details</h3>
        <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Role}>
          {(isAllowed) => {
            return (
              <Tooltip content="Edit Role">
                <IconButton
                  isDisabled={!isAllowed}
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative"
                  onClick={() => {
                    // handlePopUpOpen("identity", {
                    //   identityId,
                    //   name: data.identity.name,
                    //   role: data.role,
                    //   customRole: data.customRole
                    // });
                  }}
                >
                  <FontAwesomeIcon icon={faPencil} />
                </IconButton>
              </Tooltip>
            );
          }}
        </OrgPermissionCan>
      </div>
      <div className="pt-4">
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Role ID</p>
          <div className="group flex align-top">
            <p className="text-sm text-mineshaft-300">{roleId}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={copyTextId}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText(roleId);
                    setCopyTextId("Copied");
                  }}
                >
                  <FontAwesomeIcon icon={isCopyingId ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Name</p>
          <p className="text-sm text-mineshaft-300">{data.name}</p>
        </div>
      </div>
    </div>
  ) : (
    <div />
  );
};
