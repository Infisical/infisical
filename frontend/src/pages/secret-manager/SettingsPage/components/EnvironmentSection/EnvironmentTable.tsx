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
  Tooltip,
  Tr
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useSubscription
} from "@app/context";
import { useUpdateWsEnvironment } from "@app/hooks/api";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
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
  const { currentProject } = useProject();
  const { subscription } = useSubscription();

  const updateEnvironment = useUpdateWsEnvironment();

  const handleReorderEnv = async (id: string, position: number) => {
    if (!currentProject?.id) return;

    await updateEnvironment.mutateAsync({
      projectId: currentProject.id,
      id,
      position
    });

    createNotification({
      text: "Successfully re-ordered environments",
      type: "success"
    });
  };

  const environmentLimit =
    subscription.get(SubscriptionProductCategory.SecretManager, "environmentLimit") || 0;
  const isMoreEnvironmentsAllowed =
    environmentLimit && currentProject?.environments
      ? currentProject.environments.length <= environmentLimit
      : true;

  const environmentsOverPlanLimit =
    environmentLimit && currentProject?.environments
      ? Math.max(0, currentProject.environments.length - environmentLimit)
      : 0;

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
          {currentProject.environments.map(({ name, slug, id }, pos) => (
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
                        handleReorderEnv(id, Math.min(currentProject.environments.length, pos + 2))
                      }
                      colorSchema="primary"
                      variant="plain"
                      ariaLabel="update"
                      isDisabled={pos === currentProject.environments.length - 1 || !isAllowed}
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
                    <Tooltip
                      content={
                        isMoreEnvironmentsAllowed
                          ? ""
                          : `You have exceeded the number of environments allowed by your plan. To edit an existing environment, either upgrade your plan or remove at least ${environmentsOverPlanLimit} environment${environmentsOverPlanLimit === 1 ? "" : "s"}.`
                      }
                    >
                      <IconButton
                        className="mr-3 py-2"
                        onClick={() => {
                          handlePopUpOpen("updateEnv", { name, slug, id });
                        }}
                        isDisabled={!isAllowed || !isMoreEnvironmentsAllowed}
                        colorSchema="primary"
                        variant="plain"
                        ariaLabel="update"
                      >
                        <FontAwesomeIcon icon={faPencil} />
                      </IconButton>
                    </Tooltip>
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
          {currentProject.environments?.length === 0 && (
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
