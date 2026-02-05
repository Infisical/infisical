import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import { GenericFieldLabel, IconButton } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { TPamResource } from "@app/hooks/api/pam";

type Props = {
  resource: TPamResource;
  onEdit: VoidFunction;
};

export const PamResourceDetailsSection = ({ resource, onEdit }: Props) => {
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Details</h3>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Edit}
          a={ProjectPermissionSub.PamResources}
        >
          {(isAllowed) => (
            <IconButton
              variant="plain"
              colorSchema="secondary"
              ariaLabel="Edit resource details"
              onClick={onEdit}
              isDisabled={!isAllowed}
            >
              <FontAwesomeIcon icon={faEdit} />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="space-y-3">
        <GenericFieldLabel label="Name">{resource.name}</GenericFieldLabel>
        <GenericFieldLabel label="Created">
          {format(new Date(resource.createdAt), "yyyy-MM-dd, hh:mm aaa")}
        </GenericFieldLabel>
      </div>
    </div>
  );
};
