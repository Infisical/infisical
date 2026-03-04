import { useEffect, useState } from "react";
import { faEllipsis, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Pagination,
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
  ProjectPermissionPkiCertificateInstallationActions,
  ProjectPermissionSub,
  useOrganization
} from "@app/context";
import {
  TPkiInstallation,
  useDeletePkiInstallation,
  useListPkiInstallations
} from "@app/hooks/api";
import { useDebounce } from "@app/hooks/useDebounce";
import { usePopUp } from "@app/hooks/usePopUp";
import { getEndpoint, getGatewayLabel } from "@app/pages/cert-manager/pki-discovery-utils";

import { DeleteInstallationModal } from "./DeleteInstallationModal";
import { EditInstallationModal } from "./EditInstallationModal";

type Props = {
  projectId: string;
};

const PAGE_SIZE = 25;

export const InstallationsTab = ({ projectId }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [page, setPage] = useState(1);
  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedSearch] = useDebounce(searchFilter, 300);

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "editInstallation",
    "deleteInstallation"
  ] as const);

  const { data, isPending } = useListPkiInstallations({
    projectId,
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const deleteInstallation = useDeletePkiInstallation();

  const installations = data?.installations || [];
  const totalCount = data?.totalCount || 0;

  const handleDelete = async (): Promise<void> => {
    const installation = popUp.deleteInstallation.data as TPkiInstallation;
    await deleteInstallation.mutateAsync({ installationId: installation.id, projectId });
    handlePopUpClose("deleteInstallation");
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4">
        <div>
          <h2 className="text-lg font-semibold">Installations</h2>
          <p className="text-sm text-mineshaft-400">
            View and manage certificate installations identified by discovery scans.
          </p>
        </div>
      </div>
      <div className="mb-4">
        <Input
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search by name, IP, or domain..."
          className="flex-1"
        />
      </div>

      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Certificate</Th>
              <Th>Gateway</Th>
              <Th>Certs</Th>
              <Th>Last Seen</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={6} innerKey="installations" />}
            {!isPending && installations.length === 0 && (
              <Tr>
                <Td colSpan={6}>
                  <EmptyState title="No installations found" />
                </Td>
              </Tr>
            )}
            {!isPending &&
              installations.map((installation) => (
                <Tr
                  key={installation.id}
                  className="cursor-pointer hover:bg-mineshaft-700"
                  onClick={() =>
                    navigate({
                      to: "/organizations/$orgId/projects/cert-manager/$projectId/discovery/installations/$installationId",
                      params: {
                        orgId: currentOrg.id,
                        projectId,
                        installationId: installation.id
                      }
                    })
                  }
                >
                  <Td>{installation.name || getEndpoint(installation)}</Td>
                  <Td>
                    {installation.primaryCertName || <span className="text-mineshaft-400">-</span>}
                  </Td>
                  <Td>{getGatewayLabel(installation) || "N/A"}</Td>
                  <Td>
                    {installation.certificatesCount ?? installation.certificates?.length ?? 0}
                  </Td>
                  <Td>{format(new Date(installation.lastSeenAt), "MMM dd, yyyy HH:mm")}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="plain" colorSchema="secondary" size="xs">
                          <FontAwesomeIcon icon={faEllipsis} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <ProjectPermissionCan
                          I={ProjectPermissionPkiCertificateInstallationActions.Edit}
                          a={ProjectPermissionSub.PkiCertificateInstallations}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              isDisabled={!isAllowed}
                              onClick={() => handlePopUpOpen("editInstallation", installation)}
                            >
                              Edit
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionPkiCertificateInstallationActions.Delete}
                          a={ProjectPermissionSub.PkiCertificateInstallations}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              isDisabled={!isAllowed}
                              onClick={() => handlePopUpOpen("deleteInstallation", installation)}
                            >
                              Delete
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </TableContainer>

      {totalCount > PAGE_SIZE && (
        <div className="mt-4 flex justify-end">
          <Pagination
            count={totalCount}
            page={page}
            perPage={PAGE_SIZE}
            onChangePage={setPage}
            onChangePerPage={() => {}}
          />
        </div>
      )}

      <EditInstallationModal
        isOpen={popUp.editInstallation.isOpen}
        onClose={() => handlePopUpClose("editInstallation")}
        projectId={projectId}
        installation={popUp.editInstallation.data as TPkiInstallation | undefined}
      />

      <DeleteInstallationModal
        isOpen={popUp.deleteInstallation.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteInstallation", isOpen)}
        onConfirm={handleDelete}
        installationName={
          (popUp.deleteInstallation.data as TPkiInstallation)?.name ||
          (popUp.deleteInstallation.data as TPkiInstallation)?.locationDetails?.fqdn ||
          (popUp.deleteInstallation.data as TPkiInstallation)?.locationDetails?.ipAddress ||
          "this installation"
        }
      />
    </div>
  );
};
