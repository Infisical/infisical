import { useState } from "react";
import { faMagnifyingGlass,faPlus, faServer, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
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
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useGetWorkspaceIdentityMemberships } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityRoles } from "./IdentityRoles";

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
  const { currentWorkspace } = useWorkspace();
  const { data: identities, isLoading } = useGetWorkspaceIdentityMemberships(currentWorkspace?.id || "");

  const [searchIdentity, setSearchIdentity] = useState("");

  const filteredIdentities = identities ? identities.filter(({ identity: { name } }) => name.toLocaleLowerCase().includes(searchIdentity.toLocaleLowerCase())) : [];

  return (
    <div>
      <div className="flex">
        <Input
          value={searchIdentity}
          onChange={(e) => setSearchIdentity(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search identities..."
        />
        <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.Identity}
          >
            {(isAllowed) => (
              <Button
                colorSchema="secondary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen("identity")}
                isDisabled={!isAllowed}
                className="ml-4"
              >
                Add identity
              </Button>
            )}
          </ProjectPermissionCan>
      </div>
      <TableContainer className="mt-4">
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
            {!isLoading && filteredIdentities?.map(({ identity: { id, name }, roles, createdAt }) => {
                return (
                  <Tr className="h-10" key={`st-v3-${id}`}>
                    <Td>{name}</Td>
                    <Td>
                      <ProjectPermissionCan
                        I={ProjectPermissionActions.Edit}
                        a={ProjectPermissionSub.Identity}
                      >
                        {(isAllowed) => (
                          <IdentityRoles roles={roles} disableEdit={!isAllowed} identityId={id} />
                        )}
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
          </TBody>
        </Table>
        {!isLoading && filteredIdentities?.length === 0 && (
          <EmptyState 
            title={searchIdentity === "" ? "No identities have been added to this project" : "No matching identities found"}
            icon={faServer}
          />
        )}
      </TableContainer>
    </div>
  );
};
