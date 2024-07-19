import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  // Tooltip,
  // IconButton,
  // EmptyState,
  Table,
  TableContainer,
  // TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
// import { UsePopUpState } from "@app/hooks/usePopUp";

// import { IdentityProjectRow } from "./IdentityProjectRow";

// type Props = {
//     identityId: string;
//     handlePopUpOpen: (
//       popUpName: keyof UsePopUpState<["removeIdentityFromProject"]>,
//       data?: {}
//     ) => void;
// };

export const RolePermissionsTable = () => {
  //   const { data: projectMemberships, isLoading } = useGetIdentityProjectMemberships(identityId);
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Resource</Th>
            <Th>Allowed Actions</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          <Tr>
            <Td>Identity</Td>
            <Td>Create/Read</Td>
            <Td>
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="rounded-lg">
                  <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                    <FontAwesomeIcon size="sm" icon={faEllipsis} />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="p-1">
                  <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Role}>
                    {(isAllowed) => (
                      <DropdownMenuItem
                        className={twMerge(
                          !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          // TODO
                        }}
                        disabled={!isAllowed}
                      >
                        Edit Permission
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                  <OrgPermissionCan
                    I={OrgPermissionActions.Edit}
                    a={OrgPermissionSubjects.Identity}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        className={twMerge(
                          isAllowed
                            ? "hover:!bg-red-500 hover:!text-white"
                            : "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          //   handlePopUpOpen("deleteIdentity", {
                          //     identityId: id,
                          //     name
                          //   });
                        }}
                        disabled={!isAllowed}
                      >
                        Delete Permission
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            </Td>
          </Tr>
          {/* <TableSkeleton columns={3} innerKey="role-permissions" /> */}
          {/* {isLoading && <TableSkeleton columns={2} innerKey="identity-project-memberships" />} */}
          {/* {!isLoading &&
            projectMemberships?.map((membership) => {
              return (
                <div key={`membership-${membership.id}`}>Row</div>
               <IdentityProjectRow
                 key={`identity-project-membership-${membership.id}`}
                  membership={membership}
                  handlePopUpOpen={handlePopUpOpen}
                />
              );
            })} */}
        </TBody>
      </Table>
      {/* <EmptyState title="This role does not have any permissions on it" icon={faShield} /> */}
      {/* {!isLoading && !projectMemberships?.length && (
        <EmptyState title="This identity has not been assigned to any projects" icon={faKey} />
      )} */}
    </TableContainer>
  );
};
