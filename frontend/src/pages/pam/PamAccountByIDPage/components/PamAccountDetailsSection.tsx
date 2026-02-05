import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import { GenericFieldLabel, IconButton } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";
import { PAM_RESOURCE_TYPE_MAP, TPamAccount } from "@app/hooks/api/pam";

type Props = {
  account: TPamAccount;
  onEdit: VoidFunction;
};

export const PamAccountDetailsSection = ({ account, onEdit }: Props) => {
  const resourceTypeInfo = PAM_RESOURCE_TYPE_MAP[account.resource.resourceType];

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Details</h3>
        <ProjectPermissionCan
          I={ProjectPermissionPamAccountActions.Edit}
          a={ProjectPermissionSub.PamAccounts}
        >
          {(isAllowed) => (
            <IconButton
              variant="plain"
              colorSchema="secondary"
              ariaLabel="Edit account details"
              onClick={onEdit}
              isDisabled={!isAllowed}
            >
              <FontAwesomeIcon icon={faEdit} />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="space-y-3">
        <GenericFieldLabel label="Name">{account.name}</GenericFieldLabel>
        <GenericFieldLabel label="Description">{account.description}</GenericFieldLabel>
        <GenericFieldLabel label="Type">
          <div className="flex items-center gap-2">
            <img
              alt={resourceTypeInfo.name}
              src={`/images/integrations/${resourceTypeInfo.image}`}
              className="size-4"
            />
            {resourceTypeInfo.name} Account
          </div>
        </GenericFieldLabel>
        <GenericFieldLabel label="Parent Resource">{account.resource.name}</GenericFieldLabel>
        <GenericFieldLabel label="Created">
          {format(new Date(account.createdAt), "MM/dd/yyyy, hh:mm a")}
        </GenericFieldLabel>
      </div>
    </div>
  );
};
