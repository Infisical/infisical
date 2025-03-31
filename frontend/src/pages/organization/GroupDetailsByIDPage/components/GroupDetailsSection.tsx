import { faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { IconButton, Spinner, Tooltip } from "@app/components/v2";
import { CopyButton } from "@app/components/v2/CopyButton";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "@app/context";
import { useGetGroupById } from "@app/hooks/api/";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  groupId: string;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["groupCreateUpdate"]>, data?: object) => void;
};

export const GroupDetailsSection = ({ groupId, handlePopUpOpen }: Props) => {
  const { data, isPending } = useGetGroupById(groupId);

  if (isPending) return <Spinner size="sm" className="ml-2 mt-2" />;

  return data ? (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Group Details</h3>
        <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
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
          <div className="group flex items-center gap-2">
            <p className="text-sm text-mineshaft-300">{data.group.id}</p>
            <CopyButton value={data.group.id} name="Group ID" size="xs" variant="plain" />
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Name</p>
          <p className="text-sm text-mineshaft-300">{data.group.name}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Slug</p>
          <div className="group flex items-center gap-2">
            <p className="text-sm text-mineshaft-300">{data.group.slug}</p>
            <CopyButton value={data.group.slug} name="Slug" size="xs" variant="plain" />
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
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <p className="text-mineshaft-300">Group data not found</p>
      </div>
    </div>
  );
};
