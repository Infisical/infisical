import { subject } from "@casl/ability";
import { faMinusSquare, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Button, DeleteActionModal, IconButton, Tooltip } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { usePopUp } from "@app/hooks";

import { useSelectedEntries, useSelectedEntryActions } from "../../SecretOverviewPage.store";

type Props = {
  secretPath: string;
};

export const SelectionPanel = ({ secretPath }: Props) => {
  const { permission } = useProjectPermission();

  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "bulkDeleteEntries"
  ] as const);

  const selectedEntries = useSelectedEntries();
  const { reset: resetSelectedEntries } = useSelectedEntryActions();
  const selectedCount =
    Object.keys(selectedEntries.folder).length + Object.keys(selectedEntries.secret).length;

  const isMultiSelectActive = selectedCount > 0;

  // TODO: REVISIT RBAC
  const shouldShowDelete = permission.can(
    ProjectPermissionActions.Delete,
    subject(ProjectPermissionSub.Secrets, { environment: "", secretPath })
  );

  const handleBulkDelete = async () => {
    handlePopUpClose("bulkDeleteEntries");
  };

  return (
    <>
      <div
        className={twMerge(
          "h-0 flex-shrink-0 overflow-hidden transition-all",
          isMultiSelectActive && "h-16"
        )}
      >
        <div className="mt-3.5 flex items-center rounded-md border border-mineshaft-600 bg-mineshaft-800 py-2 px-4 text-bunker-300">
          <Tooltip content="Clear">
            <IconButton variant="plain" ariaLabel="clear-selection" onClick={resetSelectedEntries}>
              <FontAwesomeIcon icon={faMinusSquare} size="lg" />
            </IconButton>
          </Tooltip>
          <div className="ml-4 flex-grow px-2 text-sm">{selectedCount} Selected</div>
          {shouldShowDelete && (
            <Button
              variant="outline_bg"
              colorSchema="danger"
              leftIcon={<FontAwesomeIcon icon={faTrash} />}
              className="ml-4"
              onClick={() => handlePopUpOpen("bulkDeleteEntries")}
              size="xs"
            >
              Delete
            </Button>
          )}
        </div>
      </div>
      <DeleteActionModal
        isOpen={popUp.bulkDeleteEntries.isOpen}
        deleteKey="delete"
        title="Do you want to delete the selected secrets and folders across envs?"
        onChange={(isOpen) => handlePopUpToggle("bulkDeleteEntries", isOpen)}
        onDeleteApproved={handleBulkDelete}
      />
    </>
  );
};
