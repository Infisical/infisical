import {
  ChevronDownIcon,
  EditIcon,
  EyeIcon,
  MoreHorizontalIcon,
  SearchIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
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
  TableRow
} from "@app/components/v3";
import { INFISICAL_SCHEDULE_DEMO_LINK } from "@app/const/links";
import { OrgPermissionSubjects, useOrganization, useSubscription } from "@app/context";
import { OrgPermissionMachineIdentityAuthTemplateActions } from "@app/context/OrgPermissionContext/types";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  TEMPLATE_UI_LABELS,
  useGetIdentityAuthTemplates
} from "@app/hooks/api/identityAuthTemplates";
import { UsePopUpState } from "@app/hooks/usePopUp";

enum TemplatesOrderBy {
  Name = "name",
  AuthMethod = "authMethod"
}

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["deleteTemplate", "createTemplate", "editTemplate", "viewUsages"]
    >,
    data?: any
  ) => void;
};

export const IdentityAuthTemplatesTable = ({ handlePopUpOpen }: Props) => {
  const { currentOrg, isSubOrganization } = useOrganization();

  const {
    offset,
    limit,
    orderBy,
    setOrderBy,
    orderDirection,
    setOrderDirection,
    search,
    debouncedSearch,
    setPage,
    setSearch,
    perPage,
    page,
    setPerPage
  } = usePagination<TemplatesOrderBy>(TemplatesOrderBy.Name, {
    initPerPage: getUserTablePreference("templatesTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("templatesTable", PreferenceKey.PerPage, newPerPage);
  };

  const organizationId = currentOrg?.id || "";
  const { subscription } = useSubscription();

  const { data, isPending } = useGetIdentityAuthTemplates({
    organizationId,
    limit,
    offset,
    search: debouncedSearch,
    isDisabled: !subscription.machineIdentityAuthTemplates
  });

  const { templates = [], totalCount = 0 } = data ?? {};
  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const handleSort = (column: TemplatesOrderBy) => {
    if (column === orderBy) {
      setOrderDirection((prev) =>
        prev === OrderByDirection.ASC ? OrderByDirection.DESC : OrderByDirection.ASC
      );
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const isFiltered = debouncedSearch.trim().length > 0;

  const renderContent = () => {
    if (!subscription.machineIdentityAuthTemplates) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>This feature has not been activated for your license.</EmptyTitle>
            <EmptyDescription>Contact us to learn more.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" variant={isSubOrganization ? "sub-org" : "org"} asChild>
              <a href={INFISICAL_SCHEDULE_DEMO_LINK} target="_blank" rel="noopener noreferrer">
                Talk to Us
              </a>
            </Button>
          </EmptyContent>
        </Empty>
      );
    }

    if (!isPending && !templates.length) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {isFiltered
                ? "No templates match search filter"
                : "No identity auth templates have been added"}
            </EmptyTitle>
            <EmptyDescription>
              {isFiltered ? "Adjust your search criteria." : "Create a template to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="w-1/4 cursor-pointer"
                onClick={() => handleSort(TemplatesOrderBy.Name)}
              >
                Name
                <ChevronDownIcon
                  className={twMerge(
                    "transition-transform",
                    orderBy === TemplatesOrderBy.Name &&
                      orderDirection === OrderByDirection.DESC &&
                      "rotate-180",
                    orderBy !== TemplatesOrderBy.Name && "opacity-30"
                  )}
                />
              </TableHead>
              <TableHead
                className="w-1/4 cursor-pointer"
                onClick={() => handleSort(TemplatesOrderBy.AuthMethod)}
              >
                Method
                <ChevronDownIcon
                  className={twMerge(
                    "transition-transform",
                    orderBy === TemplatesOrderBy.AuthMethod &&
                      orderDirection === OrderByDirection.DESC &&
                      "rotate-180",
                    orderBy !== TemplatesOrderBy.AuthMethod && "opacity-30"
                  )}
                />
              </TableHead>
              <TableHead>URL</TableHead>
              <TableHead className="w-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: perPage }).map((_, i) => (
                <TableRow key={`skeleton-${i + 1}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                </TableRow>
              ))}
            {!isPending &&
              templates?.map((template) => (
                <TableRow key={`template-${template.id}`}>
                  <TableCell isTruncatable>{template.name}</TableCell>
                  <TableCell>
                    <span className="uppercase">{template.authMethod}</span>
                  </TableCell>
                  <TableCell isTruncatable>{template.templateFields.url}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton variant="ghost" size="xs" onClick={(e) => e.stopPropagation()}>
                          <MoreHorizontalIcon />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePopUpOpen("viewUsages", { template });
                          }}
                        >
                          <EyeIcon />
                          {TEMPLATE_UI_LABELS.VIEW_USAGES}
                        </DropdownMenuItem>
                        <OrgPermissionCan
                          I={OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates}
                          a={OrgPermissionSubjects.MachineIdentityAuthTemplate}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("editTemplate", { template });
                              }}
                              isDisabled={!isAllowed}
                            >
                              <EditIcon />
                              {TEMPLATE_UI_LABELS.EDIT_TEMPLATE}
                            </DropdownMenuItem>
                          )}
                        </OrgPermissionCan>
                        <OrgPermissionCan
                          I={OrgPermissionMachineIdentityAuthTemplateActions.DeleteTemplates}
                          a={OrgPermissionSubjects.MachineIdentityAuthTemplate}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              variant="danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("deleteTemplate", {
                                  templateId: template.id,
                                  name: template.name
                                });
                              }}
                              isDisabled={!isAllowed}
                            >
                              <TrashIcon />
                              {TEMPLATE_UI_LABELS.DELETE_TEMPLATE}
                            </DropdownMenuItem>
                          )}
                        </OrgPermissionCan>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {totalCount > 0 && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
      </>
    );
  };

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates by name..."
          />
        </InputGroup>
      </div>
      {renderContent()}
    </div>
  );
};
