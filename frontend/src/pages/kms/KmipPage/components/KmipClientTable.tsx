import {
  ArrowDownIcon,
  ArrowUpIcon,
  FileBadgeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon
} from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeadLabel,
  TableRow
} from "@app/components/v3";
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
    <Card>
      <CardHeader>
        <CardTitle>
          KMIP Clients
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/kms" />
        </CardTitle>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionKmipActions.CreateClients}
            a={ProjectPermissionSub.Kmip}
          >
            {(isAllowed) => (
              <Button
                variant="project"
                onClick={() => {
                  if (subscription && !subscription.kmip) {
                    handlePopUpOpen("upgradePlan", {
                      isEnterpriseFeature: true
                    });
                    return;
                  }

                  handlePopUpOpen("upsertKmipClient", null);
                }}
                isDisabled={!isAllowed}
              >
                <PlusIcon />
                Add KMIP Client
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        <InputGroup className="mb-4">
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients by name..."
            aria-label="Search KMIP clients by name"
          />
        </InputGroup>
        {!isPending && kmipClients.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>
                {debouncedSearch.trim()
                  ? "No KMIP clients match your search"
                  : "No KMIP clients yet"}
              </EmptyTitle>
              <EmptyDescription>
                {debouncedSearch.trim()
                  ? "Try a different search term."
                  : "Add a KMIP client to grant access to your KMS project."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <div className="flex items-center gap-2">
                    <TableHeadLabel>Name</TableHeadLabel>
                    <IconButton
                      variant="ghost"
                      size="xs"
                      aria-label="Sort clients by name"
                      onClick={handleSort}
                    >
                      {orderDirection === OrderByDirection.DESC ? (
                        <ArrowUpIcon />
                      ) : (
                        <ArrowDownIcon />
                      )}
                    </IconButton>
                  </div>
                </TableHead>
                <TableHead>
                  <TableHeadLabel>Description</TableHeadLabel>
                </TableHead>
                <TableHead>
                  <TableHeadLabel>Permissions</TableHeadLabel>
                </TableHead>
                <TableHead variant="action">
                  {isFetching && !isPending ? (
                    <span className="sr-only">Refreshing clients</span>
                  ) : null}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                [0, 1, 2].map((row) => (
                  <TableRow key={row}>
                    {[0, 1, 2, 3].map((cell) => (
                      <TableCell key={cell}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isPending &&
                kmipClients.length > 0 &&
                kmipClients.map((kmipClient) => {
                  const { name, id, description, permissions } = kmipClient;

                  return (
                    <TableRow key={id}>
                      <TableCell>{name}</TableCell>
                      <TableCell className="max-w-80 break-all">{description}</TableCell>
                      <TableCell className="max-w-40">{permissions.join(", ")}</TableCell>
                      <TableCell variant="action">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              variant="ghost"
                              size="sm"
                              aria-label={`Options for ${name}`}
                            >
                              <MoreHorizontalIcon />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handlePopUpOpen("generateKmipClientCert", kmipClient)}
                              isDisabled={cannotGenerateKmipClientCertificate}
                            >
                              <FileBadgeIcon />
                              Generate Certificate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handlePopUpOpen("upsertKmipClient", kmipClient)}
                              isDisabled={cannotEditKmipClient}
                            >
                              <PencilIcon />
                              Edit KMIP Client
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handlePopUpOpen("deleteKmipClient", kmipClient)}
                              isDisabled={cannotDeleteKmipClient}
                              variant="danger"
                            >
                              <TrashIcon />
                              Delete KMIP Client
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        )}
        {!isPending && totalCount > 0 && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={handlePerPageChange}
          />
        )}
      </CardContent>
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
        paywallKey="kms.kmip-client"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to KMIP. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </Card>
  );
};
