import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { IconButton, Tooltip } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";

import { AddProjectProps } from "./types";

const AddProject = ({
  handlePopUpOpen,
  currentOrg,
  createNotification,
  orgMembershipId,
  email,
  projects
}: AddProjectProps) => {
  return (
    <OrgPermissionCan I={OrgPermissionActions.Delete} a={OrgPermissionSubjects.Member}>
      {(isAllowed) => (
        <Tooltip content="Add more projects">
          <IconButton
            onClick={() => {
              if (currentOrg?.authEnforced) {
                createNotification({
                  text: "You cannot manage users from Infisical when org-level auth is enforced for your organization",
                  type: "error"
                });
                return;
              }

              handlePopUpOpen("addProject", { orgMembershipId, email, projects });
            }}
            size="lg"
            colorSchema="primary"
            variant="plain"
            ariaLabel="update"
            className="ml-4"
            isDisabled={!isAllowed}
          >
            <FontAwesomeIcon icon={faPlus} />
          </IconButton>
        </Tooltip>
      )}
    </OrgPermissionCan>
  );
};

export default AddProject;
