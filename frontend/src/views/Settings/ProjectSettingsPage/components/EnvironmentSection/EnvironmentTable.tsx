import { faArrowDown, faArrowUp, faPencil, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useReorderWsEnvironment } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["updateEnv", "deleteEnv", "upgradePlan"]>,
    {
      name,
      slug
    }: {
      name: string;
      slug: string;
    }
  ) => void;
};

export const EnvironmentTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace, isLoading } = useWorkspace();
  const { createNotification } = useNotificationContext();
  const reorderWsEnvironment = useReorderWsEnvironment();

  const handleReorderEnv = async (shouldMoveUp: boolean, name: string, slug: string) => {
    try {
      if (!currentWorkspace?._id) return;

      const indexOfEnv = currentWorkspace.environments.findIndex(
        (env) => env.name === name && env.slug === slug
      );

      // check that this reordering is possible
      if (
        (indexOfEnv === 0 && shouldMoveUp) ||
        (indexOfEnv === currentWorkspace.environments.length - 1 && !shouldMoveUp)
      ) {
        return;
      }

      const indexToSwap = shouldMoveUp ? indexOfEnv - 1 : indexOfEnv + 1;

      await reorderWsEnvironment.mutateAsync({
        workspaceID: currentWorkspace._id,
        environmentSlug: slug,
        environmentName: name,
        otherEnvironmentSlug: currentWorkspace.environments[indexToSwap].slug,
        otherEnvironmentName: currentWorkspace.environments[indexToSwap].name
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
          {isLoading && <TableSkeleton columns={3} innerKey="project-envs" />}
          {!isLoading &&
            currentWorkspace &&
            currentWorkspace.environments.map(({ name, slug }, pos) => (
              <Tr key={name}>
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
                        onClick={() => {
                          handleReorderEnv(false, name, slug);
                        }}
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
                        onClick={() => {
                          handleReorderEnv(true, name, slug);
                        }}
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
                          handlePopUpOpen("updateEnv", { name, slug });
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
                          handlePopUpOpen("deleteEnv", { name, slug });
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
          {!isLoading && currentWorkspace && currentWorkspace.environments?.length === 0 && (
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
