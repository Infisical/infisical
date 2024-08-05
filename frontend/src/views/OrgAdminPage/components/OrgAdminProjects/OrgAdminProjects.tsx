import { useState } from "react";
import { useRouter } from "next/router";
import { faEllipsis, faMagnifyingGlass, faSignIn } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { motion } from "framer-motion";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Pagination,
  Spinner,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { useDebounce } from "@app/hooks";
import { useOrgAdminAccessProject, useOrgAdminGetProjects } from "@app/hooks/api";

export const OrgAdminProjects = withPermission(
  () => {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search);
    const [perPage, setPerPage] = useState(25);
    const router = useRouter();
    const orgAdminAccessProject = useOrgAdminAccessProject();

    const { data, isLoading: isProjectsLoading } = useOrgAdminGetProjects({
      offset: (page - 1) * perPage,
      limit: perPage,
      search: debouncedSearch || undefined
    });

    const projects = data?.projects || [];
    const projectCount = data?.count || 0;
    const isEmpty = !isProjectsLoading && projects.length === 0;

    const handleAccessProject = async (projectId: string) => {
      try {
        await orgAdminAccessProject.mutateAsync({
          projectId
        });
        await router.push({
          pathname: "/project/[projectId]/secrets/overview",
          query: {
            projectId
          }
        });
      } catch {
        createNotification({
          text: "Failed to access project",
          type: "error"
        });
      }
    };

    return (
      <motion.div
        key="panel-projects"
        transition={{ duration: 0.15 }}
        initial={{ opacity: 0, translateX: 30 }}
        animate={{ opacity: 1, translateX: 0 }}
        exit={{ opacity: 0, translateX: 30 }}
      >
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex justify-between">
            <p className="text-xl font-semibold text-mineshaft-100">Projects</p>
          </div>
          <div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
              placeholder="Search by project name"
            />
            <TableContainer className="mt-4">
              <Table>
                <THead>
                  <Tr>
                    <Th>Name</Th>
                    <Th>Slug</Th>
                    <Th>Created At</Th>
                    <Th className="w-5" />
                  </Tr>
                </THead>
                <TBody>
                  {isProjectsLoading && <TableSkeleton columns={4} innerKey="projects" />}
                  {!isProjectsLoading &&
                    projects?.map(({ name, slug, createdAt, id }) => (
                      <Tr key={`project-${id}`} className="group w-full">
                        <Td>{name}</Td>
                        <Td>{slug}</Td>
                        <Td>{format(new Date(createdAt), "yyyy-MM-dd, hh:mm aaa")}</Td>
                        <Td>
                          <div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild className="rounded-lg">
                                <Button
                                  variant="link"
                                  className="text-bunker-300 hover:text-primary-400 data-[state=open]:text-primary-400"
                                >
                                  <FontAwesomeIcon size="sm" icon={faEllipsis} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="p-1">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    handleAccessProject(id);
                                  }}
                                  icon={<FontAwesomeIcon icon={faSignIn} />}
                                  disabled={
                                    orgAdminAccessProject.variables?.projectId === id &&
                                    orgAdminAccessProject.isLoading
                                  }
                                >
                                  Access{" "}
                                  {orgAdminAccessProject.variables?.projectId === id &&
                                    orgAdminAccessProject.isLoading && <Spinner size="xs" />}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                </TBody>
              </Table>
              {!isProjectsLoading && (
                <Pagination
                  count={projectCount}
                  page={page}
                  perPage={perPage}
                  onChangePage={(newPage) => setPage(newPage)}
                  onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
                />
              )}
              {isEmpty && <EmptyState title="No projects found" />}
            </TableContainer>
          </div>
        </div>
      </motion.div>
    );
  },
  {
    action: OrgPermissionAdminConsoleAction.AccessAllProjects,
    subject: OrgPermissionSubjects.AdminConsole
  }
);
