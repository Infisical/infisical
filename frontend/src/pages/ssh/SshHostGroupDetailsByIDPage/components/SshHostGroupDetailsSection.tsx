import { faCheck, faCopy, faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { IconButton, Tooltip } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { useGetSshHostGroupById } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  sshHostGroupId: string;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["sshHostGroup"]>, data?: object) => void;
};

export const SshHostGroupDetailsSection = ({ sshHostGroupId, handlePopUpOpen }: Props) => {
  const [copyTextId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const { data: sshHostGroup } = useGetSshHostGroupById(sshHostGroupId);

  return sshHostGroup ? (
    <div className="border-mineshaft-600 bg-mineshaft-900 rounded-lg border p-4">
      <div className="border-mineshaft-400 flex items-center justify-between border-b pb-4">
        <h3 className="text-mineshaft-100 text-lg font-medium">SSH Host Group Details</h3>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Edit}
          a={ProjectPermissionSub.SshHostGroups}
        >
          {(isAllowed) => {
            return (
              <Tooltip content="Edit SSH Host Group">
                <IconButton
                  isDisabled={!isAllowed}
                  ariaLabel="edit icon"
                  variant="plain"
                  className="group relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePopUpOpen("sshHostGroup", {
                      sshHostGroupId: sshHostGroup.id
                    });
                  }}
                >
                  <FontAwesomeIcon icon={faPencil} />
                </IconButton>
              </Tooltip>
            );
          }}
        </ProjectPermissionCan>
      </div>
      <div className="pt-4">
        <div className="mb-4">
          <p className="text-mineshaft-300 text-sm font-medium">SSH Host Group ID</p>
          <div className="group flex align-top">
            <p className="text-mineshaft-300 text-sm">{sshHostGroup.id}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={copyTextId}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText(sshHostGroup.id);
                    setCopyTextId("Copied");
                  }}
                >
                  <FontAwesomeIcon icon={isCopyingId ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        </div>
        <div>
          <p className="text-mineshaft-300 text-sm font-medium">Name</p>
          <p className="text-mineshaft-300 text-sm">{sshHostGroup.name}</p>
        </div>
      </div>
    </div>
  ) : (
    <div />
  );
};
