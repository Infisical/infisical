import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { EllipsisVerticalIcon, PlusIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Input } from "@app/components/v2";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useOrganization } from "@app/context";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import {
  PAM_DOMAIN_TYPE_MAP,
  type TPamDomain,
  useDeletePamDomain,
  useListPamDomains
} from "@app/hooks/api/pamDomain";

import { PamAddDomainModal } from "./PamAddDomainModal";

type Props = {
  projectId: string;
};

export const PamDomainsTable = ({ projectId }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();

  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "addDomain",
    "deleteDomain"
  ] as const);

  const { search, debouncedSearch, setSearch, setPage, page, perPage, setPerPage, offset } =
    usePagination("", { initPerPage: 20 });

  const { data, isPending } = useListPamDomains({
    projectId,
    offset,
    limit: perPage,
    search: debouncedSearch || undefined
  });

  const domains = data?.domains || [];
  const totalCount = data?.totalCount || 0;

  useResetPageHelper({ totalCount, offset, setPage });

  const deleteMutation = useDeletePamDomain();

  const handleDelete = async () => {
    const domain = popUp.deleteDomain.data as TPamDomain;
    if (!domain) return;
    try {
      await deleteMutation.mutateAsync({
        domainId: domain.id,
        domainType: domain.domainType
      });
      createNotification({ text: "Domain deleted", type: "success" });
      handlePopUpClose("deleteDomain");
    } catch {
      createNotification({ text: "Failed to delete domain", type: "error" });
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search domains..."
          className="h-full flex-1"
          containerClassName="h-9"
        />
        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.PamDomains}
        >
          {(isAllowed) => (
            <Button
              variant="project"
              onClick={() => handlePopUpOpen("addDomain")}
              isDisabled={!isAllowed}
            >
              <PlusIcon />
              Add Domain
            </Button>
          )}
        </ProjectPermissionCan>
      </div>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted">
                  Loading domains...
                </TableCell>
              </TableRow>
            )}
            {!isPending && domains.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Empty className="border-0 bg-transparent py-8 shadow-none">
                    <EmptyHeader>
                      <EmptyTitle>{search ? "No domains match search" : "No domains"}</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
            {!isPending &&
              domains.map((domain) => {
                const typeInfo =
                  PAM_DOMAIN_TYPE_MAP[domain.domainType as keyof typeof PAM_DOMAIN_TYPE_MAP];
                return (
                  <TableRow
                    key={domain.id}
                    className="group cursor-pointer"
                    onClick={() =>
                      navigate({
                        to: "/organizations/$orgId/projects/pam/$projectId/domains/$domainType/$domainId",
                        params: {
                          orgId: currentOrg.id,
                          projectId,
                          domainType: domain.domainType,
                          domainId: domain.id
                        }
                      })
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {typeInfo?.image && (
                          <img
                            alt={typeInfo.name}
                            src={`/images/integrations/${typeInfo.image}`}
                            className="size-5"
                          />
                        )}
                        <span className="font-medium">{domain.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted">
                      {typeInfo?.name || domain.domainType}
                    </TableCell>
                    <TableCell className="text-muted">
                      {format(new Date(domain.createdAt), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            variant="ghost"
                            size="xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <EllipsisVerticalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent sideOffset={2} align="end">
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.PamDomains}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                variant="danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deleteDomain", domain);
                                }}
                              >
                                <TrashIcon className="size-4" />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
        {Boolean(totalCount) && !isPending && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
      </div>

      <PamAddDomainModal
        isOpen={popUp.addDomain.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addDomain", isOpen)}
        projectId={projectId}
      />

      <DeleteActionModal
        isOpen={popUp.deleteDomain.isOpen}
        title={`Delete domain "${(popUp.deleteDomain.data as TPamDomain)?.name}"?`}
        subTitle="This will permanently remove this domain. Associated resources will be unlinked but not deleted."
        onChange={(isOpen) => handlePopUpToggle("deleteDomain", isOpen)}
        deleteKey={(popUp.deleteDomain.data as TPamDomain)?.name || "confirm"}
        onDeleteApproved={handleDelete}
      />
    </div>
  );
};
