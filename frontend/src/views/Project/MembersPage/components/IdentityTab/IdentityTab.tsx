import { useEffect, useState } from "react";
import Link from "next/link";
import {
  faArrowDown,
  faArrowUp,
  faArrowUpRightFromSquare,
  faClock,
  faEdit,
  faMagnifyingGlass,
  faPlus,
  faServer,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Pagination,
  Spinner,
  Table,
  TableContainer,
  TableSkeleton,
  Tag,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { useDebounce } from "@app/hooks";
import { useDeleteIdentityFromWorkspace, useGetWorkspaceIdentityMemberships } from "@app/hooks/api";
import { IdentityMembership } from "@app/hooks/api/identities/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { IdentityModal } from "./components/IdentityModal";
import { IdentityRoleForm } from "./components/IdentityRoleForm";

const MAX_ROLES_TO_BE_SHOWN_IN_TABLE = 2;
const INIT_PER_PAGE = 10;
const formatRoleName = (role: string, customRoleName?: string) => {
  if (role === ProjectMembershipRole.Custom) return customRoleName;
  if (role === ProjectMembershipRole.Member) return "Developer";
  if (role === ProjectMembershipRole.NoAccess) return "No access";
  return role;
};
export const IdentityTab = withProjectPermission(
  () => {
    const { currentWorkspace } = useWorkspace();

    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(INIT_PER_PAGE);
    const [direction, setDirection] = useState("asc");
    const [orderBy, setOrderBy] = useState("name");
    const [textFilter, setTextFilter] = useState("");
    const debouncedTextFilter = useDebounce(textFilter);

    const workspaceId = currentWorkspace?.id ?? "";

    const offset = (page - 1) * perPage;
    const { data, isLoading, isFetching } = useGetWorkspaceIdentityMemberships(
      {
        workspaceId: currentWorkspace?.id || "",
        offset,
        limit: perPage,
        direction,
        orderBy,
        textFilter: debouncedTextFilter
      },
      { keepPreviousData: true }
    );
    const { mutateAsync: deleteMutateAsync } = useDeleteIdentityFromWorkspace();

    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "identity",
      "deleteIdentity",
      "upgradePlan",
      "updateRole"
    ] as const);

    const onRemoveIdentitySubmit = async (identityId: string) => {
      try {
        await deleteMutateAsync({
          identityId,
          workspaceId
        });

        createNotification({
          text: "Successfully removed identity from project",
          type: "success"
        });

        handlePopUpClose("deleteIdentity");
      } catch (err) {
        console.error(err);
        const error = err as any;
        const text = error?.response?.data?.message ?? "Failed to remove identity from project";

        createNotification({
          text,
          type: "error"
        });
      }
    };

    useEffect(() => {
      // reset page if no longer valid
      if (data && data.totalCount < offset) setPage(1);
    }, [data?.totalCount]);

    const handleSort = (column: string) => {
      if (column === orderBy) {
        setDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        return;
      }

      setOrderBy(column);
      setDirection("asc");
    };

    return (
      <motion.div
        key="identity-role-panel"
        transition={{ duration: 0.15 }}
        initial={{ opacity: 0, translateX: 30 }}
        animate={{ opacity: 1, translateX: 0 }}
        exit={{ opacity: 0, translateX: 30 }}
      >
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xl font-semibold text-mineshaft-100">Identities</p>
            <div className="flex w-full justify-end pr-4">
              <Link href="https://infisical.com/docs/documentation/platform/identities/overview">
                <span className="w-max cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white">
                  Documentation{" "}
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="mb-[0.06rem] ml-1 text-xs"
                  />
                </span>
              </Link>
            </div>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={ProjectPermissionSub.Identity}
            >
              {(isAllowed) => (
                <Button
                  colorSchema="primary"
                  type="submit"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => handlePopUpOpen("identity")}
                  isDisabled={!isAllowed}
                >
                  Add identity
                </Button>
              )}
            </ProjectPermissionCan>
          </div>
          <Input
            containerClassName="mb-4"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            placeholder="Search identities by name..."
          />
          <TableContainer>
            <Table>
              <THead>
                <Tr className="h-14">
                  <Th className="w-1/3">
                    <div className="flex items-center">
                      Name
                      <IconButton
                        variant="plain"
                        className={`ml-2 ${orderBy === "name" ? "" : "opacity-30"}`}
                        ariaLabel="sort"
                        onClick={() => handleSort("name")}
                      >
                        <FontAwesomeIcon
                          icon={
                            direction === "desc" && orderBy === "name" ? faArrowUp : faArrowDown
                          }
                        />
                      </IconButton>
                    </div>
                  </Th>
                  <Th className="w-1/3">Role</Th>
                  <Th>Added on</Th>
                  <Th className="w-16">{isFetching ? <Spinner size="xs" /> : null}</Th>
                </Tr>
              </THead>
              <TBody>
                {isLoading && <TableSkeleton columns={4} innerKey="project-identities" />}
                {!isLoading &&
                  data &&
                  data.identityMemberships.length > 0 &&
                  data.identityMemberships.map((identityMember, index) => {
                    const {
                      identity: { id, name },
                      roles,
                      createdAt
                    } = identityMember;
                    return (
                      <Tr className="h-10" key={`st-v3-${id}`}>
                        <Td>{name}</Td>

                        <Td>
                          <div className="flex items-center space-x-2">
                            {roles
                              .slice(0, MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
                              .map(
                                ({
                                  role,
                                  customRoleName,
                                  id: roleId,
                                  isTemporary,
                                  temporaryAccessEndTime
                                }) => {
                                  const isExpired =
                                    new Date() > new Date(temporaryAccessEndTime || ("" as string));
                                  return (
                                    <Tag key={roleId}>
                                      <div className="flex items-center space-x-2">
                                        <div className="capitalize">
                                          {formatRoleName(role, customRoleName)}
                                        </div>
                                        {isTemporary && (
                                          <div>
                                            <Tooltip
                                              content={
                                                isExpired
                                                  ? "Timed role expired"
                                                  : "Timed role access"
                                              }
                                            >
                                              <FontAwesomeIcon
                                                icon={faClock}
                                                className={twMerge(isExpired && "text-red-600")}
                                              />
                                            </Tooltip>
                                          </div>
                                        )}
                                      </div>
                                    </Tag>
                                  );
                                }
                              )}
                            {roles.length > MAX_ROLES_TO_BE_SHOWN_IN_TABLE && (
                              <HoverCard>
                                <HoverCardTrigger>
                                  <Tag>+{roles.length - MAX_ROLES_TO_BE_SHOWN_IN_TABLE}</Tag>
                                </HoverCardTrigger>
                                <HoverCardContent className="border border-gray-700 bg-mineshaft-800 p-4">
                                  {roles
                                    .slice(MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
                                    .map(
                                      ({
                                        role,
                                        customRoleName,
                                        id: roleId,
                                        isTemporary,
                                        temporaryAccessEndTime
                                      }) => {
                                        const isExpired =
                                          new Date() >
                                          new Date(temporaryAccessEndTime || ("" as string));
                                        return (
                                          <Tag key={roleId} className="capitalize">
                                            <div className="flex items-center space-x-2">
                                              <div>{formatRoleName(role, customRoleName)}</div>
                                              {isTemporary && (
                                                <div>
                                                  <Tooltip
                                                    content={
                                                      isExpired
                                                        ? "Access expired"
                                                        : "Temporary access"
                                                    }
                                                  >
                                                    <FontAwesomeIcon
                                                      icon={faClock}
                                                      className={twMerge(
                                                        new Date() >
                                                          new Date(
                                                            temporaryAccessEndTime as string
                                                          ) && "text-red-600"
                                                      )}
                                                    />
                                                  </Tooltip>
                                                </div>
                                              )}
                                            </div>
                                          </Tag>
                                        );
                                      }
                                    )}
                                </HoverCardContent>
                              </HoverCard>
                            )}
                            <Tooltip content="Edit permission">
                              <IconButton
                                size="sm"
                                variant="plain"
                                ariaLabel="update-role"
                                onClick={() =>
                                  handlePopUpOpen("updateRole", { ...identityMember, index })
                                }
                              >
                                <FontAwesomeIcon icon={faEdit} />
                              </IconButton>
                            </Tooltip>
                          </div>
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
            {!isLoading && data && data.totalCount > INIT_PER_PAGE && (
              <Pagination
                count={data.totalCount}
                page={page}
                perPage={perPage}
                onChangePage={(newPage) => setPage(newPage)}
                onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
              />
            )}
            {!isLoading && data && data?.identityMemberships.length === 0 && (
              <EmptyState
                title={
                  debouncedTextFilter.trim().length > 0
                    ? "No identities match search filter"
                    : "No identities have been added to this project"
                }
                icon={faServer}
              />
            )}
          </TableContainer>
          <Modal
            isOpen={popUp.updateRole.isOpen}
            onOpenChange={(state) => handlePopUpToggle("updateRole", state)}
          >
            <ModalContent
              className="max-w-3xl"
              title={`Manage Access for ${
                (popUp.updateRole.data as IdentityMembership)?.identity?.name
              }`}
              subTitle={`
                            Configure role-based access control by assigning machine identities a mix of roles and specific privileges. An identity will gain access to all actions within the roles assigned to it, not just the actions those roles share in common. You must choose at least one permanent role.
                            `}
            >
              <IdentityRoleForm
                onOpenUpgradeModal={(description) =>
                  handlePopUpOpen("upgradePlan", { description })
                }
                identityProjectMember={
                  data?.identityMemberships[
                    (popUp.updateRole?.data as IdentityMembership & { index: number })?.index
                  ] as IdentityMembership
                }
              />
            </ModalContent>
          </Modal>
          <IdentityModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
          <DeleteActionModal
            isOpen={popUp.deleteIdentity.isOpen}
            title={`Are you sure want to remove ${
              (popUp?.deleteIdentity?.data as { name: string })?.name || ""
            } from the project?`}
            onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
            deleteKey="confirm"
            onDeleteApproved={() =>
              onRemoveIdentitySubmit(
                (popUp?.deleteIdentity?.data as { identityId: string })?.identityId
              )
            }
          />
        </div>
      </motion.div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Identity }
);
