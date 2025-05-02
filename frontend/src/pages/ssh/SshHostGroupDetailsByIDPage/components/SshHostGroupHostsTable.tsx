import { faServer, faTrash } from "@fortawesome/free-solid-svg-icons";
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
  Tooltip,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useListSshHostGroupHosts } from "@app/hooks/api";
import { EHostGroupMembershipFilter } from "@app/hooks/api/sshHostGroup/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  sshHostGroupId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeHostFromSshHostGroup"]>,
    data?: object
  ) => void;
};

export const SshHostGroupHostsTable = ({ sshHostGroupId, handlePopUpOpen }: Props) => {
  const { data, isPending } = useListSshHostGroupHosts({
    sshHostGroupId,
    filter: EHostGroupMembershipFilter.GROUP_MEMBERS
  });

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Alias</Th>
              <Th>Hostname</Th>
              <Th>Added On</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={4} innerKey="ssh-host-group-hosts" />}
            {!isPending &&
              data?.hosts.map((host) => {
                return (
                  <Tr className="h-10" key={`host-${host.id}`}>
                    <Td>{host.alias ?? "-"}</Td>
                    <Td>{host.hostname}</Td>
                    <Td>{new Date(host.joinedGroupAt).toLocaleDateString()}</Td>
                    <Td className="flex justify-end">
                      <ProjectPermissionCan
                        I={ProjectPermissionActions.Edit}
                        a={ProjectPermissionSub.SshHostGroups}
                      >
                        {(isAllowed) => (
                          <Tooltip content="Remove host from group">
                            <IconButton
                              isDisabled={!isAllowed}
                              ariaLabel="Remove host from group"
                              onClick={() =>
                                handlePopUpOpen("removeHostFromSshHostGroup", {
                                  sshHostId: host.id,
                                  alias: host.alias,
                                  hostname: host.hostname
                                })
                              }
                              variant="plain"
                              colorSchema="danger"
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </ProjectPermissionCan>
                    </Td>
                  </Tr>
                );
              })}
          </TBody>
        </Table>
        {!isPending && !data?.hosts?.length && (
          <EmptyState title="No hosts have been added to this SSH host group" icon={faServer} />
        )}
      </TableContainer>
    </div>
  );
};

export default SshHostGroupHostsTable;
