import {
  faArrowDown,
  faArrowUp,
  faArrowUpRightFromSquare,
  faCertificate,
  faEdit,
  faEllipsis,
  faMagnifyingGlass,
  faPlus,
  faTrash,
  faUser
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
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
  Tooltip,
  Tr
} from "@app/components/v2";
import {
  ProjectPermissionKmipActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { useGetKmipClientsByProjectId } from "@app/hooks/api/kmip";
import { KmipClientOrderBy, TKmipClient } from "@app/hooks/api/kmip/types";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";

import { CreateKmipClientCertificateModal } from "./CreateKmipClientCertificateModal";
import { DeleteKmipClientModal } from "./DeleteKmipClientModal";
import { KmipClientCertificateModal } from "./KmipClientCertificateModal";
import { KmipClientModal } from "./KmipClientModal";

export const KmipClientTable = () => {
  const { currentProject } = useProject();

  const projectId = currentProject?.id ?? "";

  const {
    offset,
    limit,
    orderBy,
    orderDirection,
    setOrderDirection,
    search,
    debouncedSearch,
    setPage,
    setSearch,
    perPage,
    page,
    setPerPage
  } = usePagination(KmipClientOrderBy.Name, {
    initPerPage: getUserTablePreference("kmipClientTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("kmipClientTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data, isPending, isFetching } = useGetKmipClientsByProjectId({
    projectId,
    offset,
    limit,
    search: debouncedSearch,
    orderBy,
    orderDirection
  });

  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();

  const { kmipClients = [], totalCount = 0 } = data ?? {};
  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "upsertKmipClient",
    "deleteKmipClient",
    "generateKmipClientCert",
    "displayKmipClientCert",
    "upgradePlan"
  ] as const);

  const handleSort = () => {
    setOrderDirection((prev) =>
      prev === OrderByDirection.ASC ? OrderByDirection.DESC : OrderByDirection.ASC
    );
  };

  const cannotEditKmipClient = permission.cannot(
    ProjectPermissionKmipActions.UpdateClients,
    ProjectPermissionSub.Kmip
  );

  const cannotDeleteKmipClient = permission.cannot(
    ProjectPermissionKmipActions.DeleteClients,
    ProjectPermissionSub.Kmip
  );

  const cannotGenerateKmipClientCertificate = permission.cannot(
    ProjectPermissionKmipActions.GenerateClientCertificates,
    ProjectPermissionSub.Kmip
  );

  return (
    <motion.div
      key="kmip-clients-tab"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xl font-medium whitespace-nowrap text-mineshaft-100">KMIP Clients</p>
          <div className="flex w-full justify-end pr-4">
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://infisical.com/docs/documentation/platform/kms"
            >
              <span className="flex w-max cursor-pointer items-center rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white">
                Documentation{" "}
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="mb-[0.06rem] ml-1 text-xs"
                />
              </span>
            </a>
          </div>
          <ProjectPermissionCan
            I={ProjectPermissionKmipActions.CreateClients}
            a={ProjectPermissionSub.Kmip}
          >
            {(isAllowed) => (
              <Button
                colorSchema="primary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => {
                  if (
                    subscription &&
                    !subscription.get(SubscriptionProductCategory.CertificateManager, "kmip")
                  ) {
                    handlePopUpOpen("upgradePlan", {
                      isEnterpriseFeature: true
                    });
                    return;
                  }

                  handlePopUpOpen("upsertKmipClient", null);
                }}
                isDisabled={!isAllowed}
              >
                Add KMIP Client
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
        <Input
          containerClassName="mb-4"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search clients by name..."
        />
        <TableContainer>
          <Table>
            <THead>
              <Tr className="h-14">
                <Th>
                  <div className="flex items-center">
                    Name
                    <IconButton
                      variant="plain"
                      className="ml-2"
                      ariaLabel="sort"
                      onClick={handleSort}
                    >
                      <FontAwesomeIcon
                        icon={orderDirection === OrderByDirection.DESC ? faArrowUp : faArrowDown}
                      />
                    </IconButton>
                  </div>
                </Th>
                <Th>Description</Th>
                <Th>Permissions</Th>
                <Th className="w-16">{isFetching ? <Spinner size="xs" /> : null}</Th>
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={3} innerKey="project-kmip-clients" />}
              {!isPending &&
                kmipClients.length > 0 &&
                kmipClients.map((kmipClient) => {
                  const { name, id, description, permissions } = kmipClient;

                  return (
                    <Tr className="group h-10 hover:bg-mineshaft-700" key={`st-v3-${id}`}>
                      <Td>{name}</Td>
                      <Td className="max-w-80 break-all">{description}</Td>
                      <Td className="max-w-40">{[permissions.join(", ")]}</Td>
                      <Td className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              variant="plain"
                              colorSchema="primary"
                              className="ml-4 p-0 data-[state=open]:text-primary-400"
                              ariaLabel="More options"
                            >
                              <FontAwesomeIcon size="lg" icon={faEllipsis} />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="min-w-[160px]">
                            <Tooltip
                              content={
                                cannotGenerateKmipClientCertificate ? "Access Restricted" : ""
                              }
                              position="left"
                            >
                              <div>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handlePopUpOpen("generateKmipClientCert", kmipClient)
                                  }
                                  icon={<FontAwesomeIcon icon={faCertificate} />}
                                  iconPos="left"
                                  isDisabled={cannotGenerateKmipClientCertificate}
                                >
                                  Generate Certificate
                                </DropdownMenuItem>
                              </div>
                            </Tooltip>
                            <Tooltip
                              content={cannotEditKmipClient ? "Access Restricted" : ""}
                              position="left"
                            >
                              <div>
                                <DropdownMenuItem
                                  onClick={() => handlePopUpOpen("upsertKmipClient", kmipClient)}
                                  icon={<FontAwesomeIcon icon={faEdit} />}
                                  iconPos="left"
                                  isDisabled={cannotEditKmipClient}
                                >
                                  Edit KMIP Client
                                </DropdownMenuItem>
                              </div>
                            </Tooltip>
                            <Tooltip
                              content={cannotDeleteKmipClient ? "Access Restricted" : ""}
                              position="left"
                            >
                              <div>
                                <DropdownMenuItem
                                  onClick={() => handlePopUpOpen("deleteKmipClient", kmipClient)}
                                  icon={<FontAwesomeIcon icon={faTrash} />}
                                  iconPos="left"
                                  isDisabled={cannotDeleteKmipClient}
                                >
                                  Delete KMIP Client
                                </DropdownMenuItem>
                              </div>
                            </Tooltip>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isPending && totalCount > 0 && (
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={(newPage) => setPage(newPage)}
              onChangePerPage={handlePerPageChange}
            />
          )}
          {!isPending && kmipClients.length === 0 && (
            <EmptyState
              title={
                debouncedSearch.trim().length > 0
                  ? "No KMIP clients match search filter"
                  : "No KMIP clients have been added to this project"
              }
              icon={faUser}
            />
          )}
        </TableContainer>
        <DeleteKmipClientModal
          isOpen={popUp.deleteKmipClient.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("deleteKmipClient", isOpen)}
          kmipClient={popUp.deleteKmipClient.data as TKmipClient}
        />
        <KmipClientModal
          isOpen={popUp.upsertKmipClient.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upsertKmipClient", isOpen)}
          kmipClient={popUp.upsertKmipClient.data as TKmipClient | null}
        />
        <CreateKmipClientCertificateModal
          isOpen={popUp.generateKmipClientCert.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("generateKmipClientCert", isOpen)}
          kmipClient={popUp.generateKmipClientCert.data as TKmipClient | null}
          displayNewClientCertificate={(certificate) =>
            handlePopUpOpen("displayKmipClientCert", certificate)
          }
        />
        <KmipClientCertificateModal
          isOpen={popUp.displayKmipClientCert.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("displayKmipClientCert", isOpen)}
          certificate={popUp.displayKmipClientCert.data}
        />
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="Your current plan does not include access to KMIP. To unlock this feature, please upgrade to Infisical Enterprise plan."
          isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
        />
      </div>
    </motion.div>
  );
};
