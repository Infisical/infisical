import { faCheck, faCopy, faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { IconButton, Tooltip } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { useGetGroupById } from "@app/hooks/api/";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  groupId: string;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["groupCreateUpdate"]>, data?: {}) => void;
};

export const GroupDetailsSection = ({ groupId, handlePopUpOpen }: Props) => {
  const [copyTextId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const { data } = useGetGroupById(groupId);
  return data ? (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Group Details</h3>
        <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Groups}>
          {(isAllowed) => {
            return (
              <Tooltip content="Edit Group">
                <IconButton
                  isDisabled={!isAllowed}
                  ariaLabel="edit group button"
                  variant="plain"
                  className="group relative"
                  onClick={() => {
                    handlePopUpOpen("groupCreateUpdate", {
                      groupId,
                      name: data.group.name,
                      slug: data.group.slug,
                      role: data.group.role
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
          <p className="text-sm font-semibold text-mineshaft-300">Group ID</p>
          <div className="group flex align-top">
            <p className="text-sm text-mineshaft-300">{data.group.id}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={copyTextId}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText(data.group.id);
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
          <p className="text-sm text-mineshaft-300">{data.group.name}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Slug</p>
          <div className="group flex align-top">
            <p className="text-sm text-mineshaft-300">{data.group.slug}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={copyTextId}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText(data.group.slug);
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
          <p className="text-sm font-semibold text-mineshaft-300">Organization Role</p>
          <p className="text-sm text-mineshaft-300">{data.group.role}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Created At</p>
          <p className="text-sm text-mineshaft-300">
            {new Date(data.group.createdAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  ) : (
    <div />
  );
};
