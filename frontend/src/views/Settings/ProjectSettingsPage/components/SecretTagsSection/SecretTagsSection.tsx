import { useState } from "react";
import { faMagnifyingGlass, faPlus, faTags,faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { PermissionDeniedBanner, ProjectPermissionCan } from "@app/components/permissions";
import {
  Button, 
  DeleteActionModal, 
  EmptyState,
  IconButton,
  Input, 
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { 
  useDeleteWsTag,
  useGetWsTags
} from "@app/hooks/api";

import { AddSecretTagModal } from "./AddSecretTagModal";

type DeleteModalData = { name: string; id: string };

export const SecretTagsSection = (): JSX.Element => {
  const { createNotification } = useNotificationContext();
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "CreateSecretTag",
    "deleteTagConfirmation"
  ] as const);
  const { currentWorkspace } = useWorkspace();
  const { data: tags, isLoading } = useGetWsTags(currentWorkspace?.id ?? "");
  const { permission } = useProjectPermission();
  const deleteWsTag = useDeleteWsTag();
  const [searchTag, setSearchTag] = useState("");

  const onDeleteApproved = async () => {
    try {
      await deleteWsTag.mutateAsync({
        projectId: currentWorkspace?.id || "",
        tagID: (popUp?.deleteTagConfirmation?.data as DeleteModalData)?.id
      });

      createNotification({
        text: "Successfully deleted tag",
        type: "success"
      });

      handlePopUpClose("deleteTagConfirmation");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete the tag",
        type: "error"
      });
    }
  };

  const filteredTags = tags
    ? tags.filter(({ name }) => name.toLocaleLowerCase().includes(searchTag.toLocaleLowerCase()))
    : [];
    
  return (
    <div>
      <hr className="border-mineshaft-600" />
      <div className="flex items-center justify-between pt-4">
        <p className="text-md text-mineshaft-100">Secret Tags</p>
        
      </div>
      <p className="pt-4 text-sm text-mineshaft-300">
        Every secret can be assigned to one or more tags. Here you can add and remove tags for the
        current project.
      </p>
      <div className="pt-4 flex">
        <Input
          value={searchTag}
          onChange={(e) => setSearchTag(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search tags by name/slug..."
        />
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Tags}>
          {(isAllowed) => (
            <Button
              colorSchema="secondary"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => {
                handlePopUpOpen("CreateSecretTag");
              }}
              isDisabled={!isAllowed}
              className="ml-4"
            >
              Create
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="py-4">
        {permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags) ? (
          <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Slug</Th>
            <Th aria-label="button" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={3} innerKey="secret-tags" />}
          {filteredTags?.map(({ id, name, slug }) => (
              <Tr key={name}>
                <Td>{name}</Td>
                <Td>{slug}</Td>
                <Td className="flex items-center justify-end">
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Delete}
                    a={ProjectPermissionSub.Tags}
                  >
                    {(isAllowed) => (
                      <IconButton
                        onClick={() =>
                          handlePopUpOpen("deleteTagConfirmation", {
                            name,
                            id
                          })
                        }
                        size="lg"
                        colorSchema="danger"
                        variant="plain"
                        ariaLabel="update"
                        isDisabled={!isAllowed}
                      >
                        <FontAwesomeIcon icon={faXmark} />
                      </IconButton>
                    )}
                  </ProjectPermissionCan>
                </Td>
              </Tr>
            ))}
          
        </TBody>
      </Table>
      {!isLoading && filteredTags?.length === 0 && (
        <EmptyState title="No secret tags found" icon={faTags} />
      )}
    </TableContainer>
        ) : (
          <PermissionDeniedBanner />
        )}
      </div>
      <AddSecretTagModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <DeleteActionModal
        isOpen={popUp.deleteTagConfirmation.isOpen}
        title={`Delete ${
          (popUp?.deleteTagConfirmation?.data as DeleteModalData)?.name || " "
        } api key?`}
        onChange={(isOpen) => handlePopUpToggle("deleteTagConfirmation", isOpen)}
        deleteKey={(popUp?.deleteTagConfirmation?.data as DeleteModalData)?.name}
        onClose={() => handlePopUpClose("deleteTagConfirmation")}
        onDeleteApproved={onDeleteApproved}
      />
    </div>
  );
};
