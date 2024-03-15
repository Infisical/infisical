import {
  faArrowLeft,
  faPencil,
  faPlus,
  faTrash,
  faUserShield
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  IconButton,
  Tag,
  Tooltip
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useDeleteIdentityProjectAdditionalPrivilege,
  useDeleteProjectUserAdditionalPrivilege
} from "@app/hooks/api";
import { TWorkspaceUser } from "@app/hooks/api/types";

import { AdditionalPrivilegeForm } from "./AdditionalPrivilegeForm";
import { AdditionalPrivilegeTemporaryAccess } from "./AdditionalPrivilegeTemporaryAccess";

type Props = {
  onGoBack: VoidFunction;
  name: string;
  isIdentity?: boolean;
  // isIdentity id - identity id else projectMembershipId
  actorId: string;
  privileges: TWorkspaceUser["additionalPrivileges"];
};

export const AdditionalPrivilegeSection = ({
  onGoBack,
  privileges = [],
  actorId,
  name,
  isIdentity
}: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "modifyPrivilege",
    "deletePrivilege"
  ] as const);
  const { createNotification } = useNotificationContext();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";
  const deleteProjectUserAdditionalPrivilege = useDeleteProjectUserAdditionalPrivilege();
  const deleteProjectIdentityAdditionalPrivilege = useDeleteIdentityProjectAdditionalPrivilege();

  const onPrivilegeDelete = async (privilegeId: string) => {
    try {
      if (isIdentity) {
        await deleteProjectIdentityAdditionalPrivilege.mutateAsync({
          privilegeId,
          projectId: workspaceId
        });
      } else {
        await deleteProjectUserAdditionalPrivilege.mutateAsync({
          privilegeId,
          workspaceId
        });
      }
      handlePopUpClose("deletePrivilege");
      createNotification({
        type: "success",
        text: "Successfully removed privilege"
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to delete privilege"
      });
    }
  };

  if (popUp.modifyPrivilege.isOpen) {
    const privilegeDetails = popUp?.modifyPrivilege?.data as {
      id: string;
    };

    return (
      <motion.div
        key="panel-additional-permission"
        transition={{ duration: 0.15 }}
        initial={{ opacity: 0, translateX: 30 }}
        animate={{ opacity: 1, translateX: 0 }}
        exit={{ opacity: 0, translateX: 30 }}
      >
        <AdditionalPrivilegeForm
          onGoBack={() => handlePopUpClose("modifyPrivilege")}
          privilegeId={privilegeDetails?.id}
          workspaceId={workspaceId}
          isIdentity={isIdentity}
          actorId={actorId}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      key="panel-privileges-list"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <div className="mb-8 flex items-center justify-between rounded-lg">
        <h1 className="text-xl font-semibold capitalize text-mineshaft-100">
          Additional Privileges - {name}
        </h1>
        <div className="flex items-center space-x-4">
          <Button
            onClick={onGoBack}
            variant="outline_bg"
            leftIcon={<FontAwesomeIcon icon={faArrowLeft} />}
          >
            Go back
          </Button>
          <Button
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => handlePopUpOpen("modifyPrivilege")}
          >
            New Privilege
          </Button>
        </div>
      </div>
      <div className="mt-6 flex flex-col space-y-4">
        {privileges.length === 0 && (
          <EmptyState
            title={`${isIdentity ? "Machine identity" : "User"} has no additional privileges`}
            iconSize="3x"
            icon={faUserShield}
          />
        )}
        {privileges.map(({ id, name: privilegeName, description, slug, ...dto }) => (
          <div
            className="flex items-center space-x-4 rounded-md bg-mineshaft-800 p-4 px-6"
            key={id}
          >
            <div className="flex flex-grow flex-col">
              <div className="mb-1 flex items-center text-lg font-medium">
                <span className="capitalize">{privilegeName}</span>
                <Tag size="xs" className="ml-2">
                  {slug}
                </Tag>
              </div>
              <div className="text-xs font-light capitalize">{description}</div>
            </div>
            <div className="flex items-center space-x-4">
              <AdditionalPrivilegeTemporaryAccess
                isIdentity={isIdentity}
                privilegeId={id}
                workspaceId={workspaceId}
                temporaryConfig={!dto.isTemporary ? { isTemporary: false } : { ...dto }}
              />
              <IconButton
                size="sm"
                variant="outline_bg"
                ariaLabel="update"
                onClick={() => handlePopUpOpen("modifyPrivilege", { id })}
              >
                <Tooltip content="Edit">
                  <FontAwesomeIcon icon={faPencil} />
                </Tooltip>
              </IconButton>
              <IconButton
                size="sm"
                colorSchema="danger"
                variant="outline_bg"
                ariaLabel="delete-privilege"
                onClick={() => handlePopUpOpen("deletePrivilege", { name: privilegeName, id })}
              >
                <Tooltip content="Delete">
                  <FontAwesomeIcon icon={faTrash} />
                </Tooltip>
              </IconButton>
            </div>
          </div>
        ))}
      </div>
      <DeleteActionModal
        isOpen={popUp.deletePrivilege.isOpen}
        title={`Are you sure want to remove privilege ${(popUp?.deletePrivilege.data as { name: string })?.name || " "
          } for user ${name}?`}
        onChange={(isOpen) => handlePopUpToggle("deletePrivilege", isOpen)}
        deleteKey="delete"
        onDeleteApproved={async () =>
          onPrivilegeDelete((popUp?.deletePrivilege.data as { id: string }).id)
        }
      />
    </motion.div>
  );
};
