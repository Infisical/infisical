import { faArrowDown, faArrowUp, faPencil, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useUpdateWsEnvironment } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["updateEnv", "deleteEnv", "upgradePlan"]>,
    {
      name,
      slug,
      id
    }: {
      name: string;
      slug: string;
      id: string;
    }
  ) => void;
};

export const EnvironmentTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();

  const updateEnvironment = useUpdateWsEnvironment();

  const handleReorderEnv = async (id: string, position: number) => {
    try {
      if (!currentWorkspace?.id) return;

      await updateEnvironment.mutateAsync({
        workspaceId: currentWorkspace.id,
        id,
        position
      });

      createNotification({
        text: "Successfully re-ordered environments",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to re-order environments",
        type: "error"
      });
    }
  };

  return (
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
          {currentWorkspace.environments.map(({ name, slug, id }, pos) => (
            <Tr key={id}>
              <Td>{name}</Td>
              <Td>{slug}</Td>
              <Td className="flex items-center justify-end">
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={ProjectPermissionSub.Environments}
                >
                  {(isAllowed) => (
                    <IconButton
                      className="mr-3 py-2"
                      onClick={() =>
                        handleReorderEnv(
                          id,
                          Math.min(currentWorkspace.environments.length, pos + 2)
                        )
                      }
                      colorSchema="primary"
                      variant="plain"
                      ariaLabel="update"
                      isDisabled={pos === currentWorkspace.environments.length - 1 || !isAllowed}
                    >
                      <FontAwesomeIcon icon={faArrowDown} />
                    </IconButton>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={ProjectPermissionSub.Environments}
                >
                  {(isAllowed) => (
                    <IconButton
                      className="mr-3 py-2"
                      onClick={() => handleReorderEnv(id, Math.max(1, pos))}
                      colorSchema="primary"
                      variant="plain"
                      ariaLabel="update"
                      isDisabled={pos === 0 || !isAllowed}
                    >
                      <FontAwesomeIcon icon={faArrowUp} />
                    </IconButton>
                  )}
                </ProjectPermissionCan>

                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={ProjectPermissionSub.Environments}
                >
                  {(isAllowed) => (
                    <IconButton
                      className="mr-3 py-2"
                      onClick={() => {
                        handlePopUpOpen("updateEnv", { name, slug, id });
                      }}
                      isDisabled={!isAllowed}
                      colorSchema="primary"
                      variant="plain"
                      ariaLabel="update"
                    >
                      <FontAwesomeIcon icon={faPencil} />
                    </IconButton>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Delete}
                  a={ProjectPermissionSub.Environments}
                >
                  {(isAllowed) => (
                    <IconButton
                      onClick={() => {
                        handlePopUpOpen("deleteEnv", { name, slug, id });
                      }}
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
          {currentWorkspace.environments?.length === 0 && (
            <Tr>
              <Td colSpan={3}>
                <EmptyState title="No environments found" />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
