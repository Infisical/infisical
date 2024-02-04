import { faServer, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  EmptyState,
  IconButton,
  Select,
  SelectItem,
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
import {
  useGetProjectRoles,
  useGetWorkspaceIdentityMemberships,
  useUpdateIdentityWorkspaceRole
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteIdentity", "identity"]>,
    data?: {
      identityId?: string;
      name?: string;
    }
  ) => void;
};

export const IdentityTable = ({ handlePopUpOpen }: Props) => {
  const { createNotification } = useNotificationContext();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";
  const { data, isLoading } = useGetWorkspaceIdentityMemberships(currentWorkspace?.id || "");

  const { data: roles } = useGetProjectRoles(workspaceId);

  const { mutateAsync: updateMutateAsync } = useUpdateIdentityWorkspaceRole();

  const handleChangeRole = async ({ identityId, role }: { identityId: string; role: string }) => {
    try {
      await updateMutateAsync({
        identityId,
        workspaceId,
        role
      });

      createNotification({
        text: "Successfully updated identity role",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to update identity role";

      createNotification({
        text,
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
            <Th>Role</Th>
            <Th>Added on</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={7} innerKey="project-identities" />}
          {!isLoading &&
            data &&
            data.length > 0 &&
            data.map(({ identity: { id, name }, role, customRole, createdAt }) => {
              return (
                <Tr className="h-10" key={`st-v3-${id}`}>
                  <Td>{name}</Td>
                  <Td>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={ProjectPermissionSub.Identity}
                    >
                      {(isAllowed) => {
                        return (
                          <Select
                            value={role === "custom" ? (customRole?.slug as string) : role}
                            isDisabled={!isAllowed}
                            className="w-40 bg-mineshaft-600"
                            dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
                            onValueChange={(selectedRole) =>
                              handleChangeRole({
                                identityId: id,
                                role: selectedRole
                              })
                            }
                          >
                            {(roles || []).map(({ slug, name: roleName }) => (
                              <SelectItem value={slug} key={`owner-option-${slug}`}>
                                {roleName}
                              </SelectItem>
                            ))}
                          </Select>
                        );
                      }}
                    </ProjectPermissionCan>
                  </Td>
                  <Td>{format(new Date(createdAt), "yyyy-MM-dd")}</Td>
                  <Td className="flex justify-end">
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Delete}
                      a={ProjectPermissionSub.Identity}
                    >
                      {(isAllowed) => (
                        <IconButton
                          onClick={() => {
                            handlePopUpOpen("deleteIdentity", {
                              identityId: id,
                              name
                            });
                          }}
                          size="lg"
                          colorSchema="danger"
                          variant="plain"
                          ariaLabel="update"
                          className="ml-4"
                          isDisabled={!isAllowed}
                        >
                          <FontAwesomeIcon icon={faXmark} />
                        </IconButton>
                      )}
                    </ProjectPermissionCan>
                  </Td>
                </Tr>
              );
            })}
          {!isLoading && data && data?.length === 0 && (
            <Tr>
              <Td colSpan={7}>
                <EmptyState title="No identities have been added to this project" icon={faServer} />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
