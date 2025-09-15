import { faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { IconButton, Spinner, Tooltip } from "@app/components/v2";
import { CopyButton } from "@app/components/v2/CopyButton";
import { OrgPermissionIdentityGroupActions, OrgPermissionSubjects } from "@app/context";
import { useGetIdentityGroupById } from "@app/hooks/api/";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  identityGroupId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["identityGroupCreateUpdate"]>,
    data?: object
  ) => void;
};

export const IdentityGroupDetailsSection = ({ identityGroupId, handlePopUpOpen }: Props) => {
  const { data, isPending } = useGetIdentityGroupById(identityGroupId);

  if (isPending) return <Spinner size="sm" className="ml-2 mt-2" />;

  return data ? (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Identity Group Details</h3>
        <OrgPermissionCan
          I={OrgPermissionIdentityGroupActions.Edit}
          a={OrgPermissionSubjects.IdentityGroups}
        >
          {(isAllowed) => {
            return (
              <Tooltip content="Edit Identity Group">
                <IconButton
                  isDisabled={!isAllowed}
                  ariaLabel="edit identity group button"
                  variant="plain"
                  className="group relative"
                  onClick={() => {
                    handlePopUpOpen("identityGroupCreateUpdate", {
                      identityGroupId,
                      name: data.identityGroup.name,
                      slug: data.identityGroup.slug,
                      role: data.identityGroup.role
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
          <p className="text-sm font-semibold text-mineshaft-300">Identity Group ID</p>
          <div className="group flex items-center gap-2">
            <p className="text-sm text-mineshaft-300">{data.identityGroup.id}</p>
            <CopyButton
              value={data.identityGroup.id}
              name="Identity Group ID"
              size="xs"
              variant="plain"
            />
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Name</p>
          <p className="text-sm text-mineshaft-300">{data.identityGroup.name}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Slug</p>
          <div className="group flex items-center gap-2">
            <p className="text-sm text-mineshaft-300">{data.identityGroup.slug}</p>
            <CopyButton value={data.identityGroup.slug} name="Slug" size="xs" variant="plain" />
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Organization Role</p>
          <p className="text-sm text-mineshaft-300">{data.identityGroup.role}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Created At</p>
          <p className="text-sm text-mineshaft-300">
            {new Date(data.identityGroup.createdAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  ) : (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <p className="text-mineshaft-300">Identity Group data not found</p>
      </div>
    </div>
  );
};
