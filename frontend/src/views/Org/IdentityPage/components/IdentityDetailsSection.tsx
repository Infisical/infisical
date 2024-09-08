import { faCheck, faCheckCircle, faCopy, faMinusCircle, faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { IconButton, Tooltip } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { useGetIdentityById } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  identityId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["identity", "identityAuthMethod", "token", "clientSecret"]>,
    data?: {}
  ) => void;
};

export const IdentityDetailsSection = ({ identityId, handlePopUpOpen }: Props) => {
  const [copyTextId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const { data } = useGetIdentityById(identityId);
  return data ? (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Identity Details</h3>
        <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Identity}>
          {(isAllowed) => {
            return (
              <Tooltip content="Edit Identity">
                <IconButton
                  isDisabled={!isAllowed}
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative"
                  onClick={() => {
                    handlePopUpOpen("identity", {
                      identityId,
                      name: data.identity.name,
                      isDisabled: data.identity.isDisabled,
                      role: data.role,
                      customRole: data.customRole
                    });
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
          <p className="text-sm font-semibold text-mineshaft-300">Identity ID</p>
          <div className="group flex align-top">
            <p className="text-sm text-mineshaft-300">{data.identity.id}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={copyTextId}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText(data.identity.id);
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
          <p className="text-sm text-mineshaft-300">{data.identity.name}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Status</p>
          <p className={`text-sm ${data.identity.isDisabled ? "text-gray-400" : "text-green-600"}`}>
            <span className="inline-flex items-center gap-0.5">
              <FontAwesomeIcon icon={data.identity.isDisabled ? faMinusCircle : faCheckCircle} />
              {data.identity.isDisabled ? "Disabled" : "Active"}
            </span>
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-mineshaft-300">Organization Role</p>
          <p className="text-sm text-mineshaft-300">{data.role}</p>
        </div>
      </div>
    </div>
  ) : (
    <div />
  );
};
