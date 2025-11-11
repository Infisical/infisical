import { subject } from "@casl/ability";
import {
  faCheck,
  faChevronDown,
  faCopy,
  faEdit,
  faKey,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Modal,
  ModalContent,
  Tag,
  Tooltip
} from "@app/components/v2";
import { ProjectPermissionIdentityActions, ProjectPermissionSub, useProject } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { usePopUp, useTimedReset } from "@app/hooks";
import { identityAuthToNameMap, TProjectIdentity, useDeleteProjectIdentity } from "@app/hooks/api";
import { IdentityProjectMembershipV1 } from "@app/hooks/api/identities/types";
import { ProjectIdentityModal } from "@app/pages/project/AccessControlPage/components/IdentityTab/components/ProjectIdentityModal";

type Props = {
  identity: TProjectIdentity;
  isOrgIdentity?: boolean;
  membership: IdentityProjectMembershipV1;
};

export const ProjectIdentityDetailsSection = ({ identity, isOrgIdentity, membership }: Props) => {
  const [copyTextId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const { currentProject } = useProject();
  const { mutateAsync: deleteIdentity } = useDeleteProjectIdentity();
  const navigate = useNavigate();
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp([
    "editIdentity",
    "deleteIdentity"
  ] as const);

  const handleDeleteIdentity = async () => {
    try {
      await deleteIdentity({
        identityId: identity.id,
        projectId: identity.projectId!
      });

      navigate({
        to: `${getProjectBaseURL(currentProject.type)}/access-management`,
        search: {
          selectedTab: "identities"
        }
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to delete project identity"
      });
    }
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-medium text-mineshaft-100">Identity Details</h3>
        <DropdownMenu>
          {!isOrgIdentity && (
            <DropdownMenuTrigger asChild>
              <Button
                size="xs"
                rightIcon={
                  <FontAwesomeIcon
                    className="ml-1 transition-transform duration-200 group-data-[state=open]:rotate-180"
                    icon={faChevronDown}
                  />
                }
                colorSchema="secondary"
                className="group select-none"
              >
                Options
              </Button>
            </DropdownMenuTrigger>
          )}
          <DropdownMenuContent className="mt-3 min-w-[120px]" align="end">
            <ProjectPermissionCan
              I={ProjectPermissionIdentityActions.Edit}
              a={subject(ProjectPermissionSub.Identity, {
                identityId: identity.id
              })}
            >
              {(isAllowed) => (
                <DropdownMenuItem
                  className={twMerge(
                    !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                  )}
                  icon={<FontAwesomeIcon icon={faEdit} />}
                  onClick={async () => {
                    handlePopUpOpen("editIdentity");
                  }}
                  disabled={!isAllowed}
                >
                  Edit Identity
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
            <ProjectPermissionCan
              I={ProjectPermissionIdentityActions.Delete}
              a={subject(ProjectPermissionSub.Identity, {
                identityId: identity.id
              })}
            >
              {(isAllowed) => (
                <DropdownMenuItem
                  className={twMerge(
                    isAllowed
                      ? "hover:bg-red-500! hover:text-white!"
                      : "pointer-events-none cursor-not-allowed opacity-50"
                  )}
                  onClick={async () => {
                    handlePopUpOpen("deleteIdentity");
                  }}
                  icon={<FontAwesomeIcon icon={faTrash} />}
                  disabled={!isAllowed}
                >
                  Delete Identity
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="pt-4">
        <div className="mb-4">
          <p className="text-sm font-medium text-mineshaft-300">Identity ID</p>
          <div className="group flex align-top">
            <p className="text-sm break-all text-mineshaft-300">{identity.id}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={copyTextId}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText(identity.id);
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
          <p className="text-sm font-medium text-mineshaft-300">Managed By</p>
          <p className="text-sm text-mineshaft-300">
            {identity.projectId ? "Project" : "Organization"}
          </p>
        </div>
        {!isOrgIdentity && (
          <>
            <div className="mb-4">
              <p className="text-sm font-medium text-mineshaft-300">Last Login Auth Method</p>
              <p className="text-sm text-mineshaft-300">
                {membership.lastLoginAuthMethod
                  ? identityAuthToNameMap[membership.lastLoginAuthMethod]
                  : "-"}
              </p>
            </div>
            <div className="mb-4">
              <p className="text-sm font-medium text-mineshaft-300">Last Login Time</p>
              <p className="text-sm text-mineshaft-300">
                {membership.lastLoginTime ? format(membership.lastLoginTime, "PPpp") : "-"}
              </p>
            </div>
            <div className="mb-4">
              <p className="text-sm font-medium text-mineshaft-300">Delete Protection</p>
              <p className="text-sm text-mineshaft-300">
                {identity.hasDeleteProtection ? "On" : "Off"}
              </p>
            </div>
          </>
        )}
        <div>
          <p className="text-sm font-medium text-mineshaft-300">Metadata</p>
          {identity?.metadata?.length ? (
            <div className="mt-1 flex flex-wrap gap-2 text-sm text-mineshaft-300">
              {identity.metadata?.map((el) => (
                <div key={el.id} className="flex items-center">
                  <Tag
                    size="xs"
                    className="mr-0 flex items-center rounded-r-none border border-mineshaft-500"
                  >
                    <FontAwesomeIcon icon={faKey} size="xs" className="mr-1" />
                    <div>{el.key}</div>
                  </Tag>
                  <Tag
                    size="xs"
                    className="flex items-center rounded-l-none border border-mineshaft-500 bg-mineshaft-900 pl-1"
                  >
                    <div className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                      {el.value}
                    </div>
                  </Tag>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-mineshaft-300">-</p>
          )}
        </div>
      </div>
      <Modal
        isOpen={popUp.editIdentity.isOpen}
        onOpenChange={(open) => handlePopUpToggle("editIdentity", open)}
      >
        <ModalContent bodyClassName="overflow-visible" title="Edit Project Identity">
          <ProjectIdentityModal
            identity={identity}
            onClose={() => handlePopUpToggle("editIdentity", false)}
          />
        </ModalContent>
      </Modal>

      <DeleteActionModal
        isOpen={popUp.deleteIdentity.isOpen}
        title={`Are you sure you want to delete ${identity.name}?`}
        onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleDeleteIdentity}
      />
    </div>
  );
};
