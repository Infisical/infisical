import { faCheck, faCopy, faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { IconButton, Tooltip } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { useGetProjectRoleBySlug } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  roleSlug: string;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["role"]>, data?: {}) => void;
};

export const RoleDetailsSection = ({ roleSlug, handlePopUpOpen }: Props) => {
  const [copyTextId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const { currentWorkspace } = useWorkspace();
  const { data } = useGetProjectRoleBySlug(currentWorkspace?.slug ?? "", roleSlug as string);

  const isCustomRole = !["admin", "member", "viewer", "no-access"].includes(data?.slug ?? "");

  return data ? (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Project Role Details</h3>
        {isCustomRole && (
          <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Role}>
            {(isAllowed) => {
              return (
                <Tooltip content="Edit Role">
                  <IconButton
                    isDisabled={!isAllowed}
                    ariaLabel="copy icon"
                    variant="plain"
                    className="group relative"
                    onClick={() => {
                      handlePopUpOpen("role", {
                        roleSlug
                      });
                    }}
                  >
                    <FontAwesomeIcon icon={faPencil} />
                  </IconButton>
                </Tooltip>
              );
            }}
          </ProjectPermissionCan>
        )}
      </div>
      <div className="pt-4">
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Role ID</p>
          <div className="group flex align-top">
            <p className="text-sm text-mineshaft-300">{data.id}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={copyTextId}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText(data.id);
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
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Slug</p>
          <p className="text-sm text-mineshaft-300">{data.slug}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Description</p>
          <p className="text-sm text-mineshaft-300">
            {data.description?.length ? data.description : "-"}
          </p>
        </div>
      </div>
    </div>
  ) : (
    <div />
  );
};
