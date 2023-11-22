import { faFolder, faKey, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
import { useGetUserWsServiceTokens } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteAPITokenConfirmation"]>,
    {
      name,
      id
    }: {
      name: string;
      id: string;
    }
  ) => void;
};

export const ServiceTokenTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data, isLoading } = useGetUserWsServiceTokens({
    workspaceID: currentWorkspace?._id || ""
  });

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Token Name</Th>
            <Th>Environment - Secret Path</Th>
            <Th>Valid Until</Th>
            <Th aria-label="button" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={4} innerKey="project-service-tokens" />}
          {!isLoading &&
            data &&
            data.map((row) => (
              <Tr key={row._id}>
                <Td>{row.name}</Td>
                <Td>
                  <div className="mb-2 flex flex-col flex-wrap space-y-1">
                    {row?.scopes.map(({ secretPath, environment }) => (
                      <div
                        key={`${row._id}-${environment}-${secretPath}`}
                        className="inline-flex items-center space-x-1 rounded-md border border-mineshaft-600 p-1 px-2"
                      >
                        <div className="mr-2 border-r border-mineshaft-600 pr-2">{environment}</div>
                        <FontAwesomeIcon icon={faFolder} size="sm" />
                        <span className="pl-2">{secretPath}</span>
                      </div>
                    ))}
                  </div>
                </Td>
                <Td>{row.expiresAt && new Date(row.expiresAt).toUTCString()}</Td>
                <Td>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Delete}
                    a={ProjectPermissionSub.ServiceTokens}
                  >
                    {(isAllowed) => (
                      <IconButton
                        onClick={() =>
                          handlePopUpOpen("deleteAPITokenConfirmation", {
                            name: row.name,
                            id: row._id
                          })
                        }
                        colorSchema="danger"
                        ariaLabel="delete"
                        isDisabled={!isAllowed}
                      >
                        <FontAwesomeIcon icon={faTrashCan} />
                      </IconButton>
                    )}
                  </ProjectPermissionCan>
                </Td>
              </Tr>
            ))}
          {!isLoading && data && data?.length === 0 && (
            <Tr>
              <Td colSpan={4} className="bg-mineshaft-800 text-center text-bunker-400">
                <EmptyState title="No service tokens found" icon={faKey} />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
