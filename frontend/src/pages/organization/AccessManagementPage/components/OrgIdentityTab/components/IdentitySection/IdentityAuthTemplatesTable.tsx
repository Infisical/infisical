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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
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
  const { currentOrg } = useOrganization();

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
      {/* eslint-disable-next-line no-nested-ternary */}
      {(!isPending || !subscription.machineIdentityAuthTemplates) && !templates.length ? (
        <UnstableEmpty className="border">
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>
              {isFiltered
                ? "No templates match search filter"
                : "No identity auth templates have been added"}
            </UnstableEmptyTitle>
            <UnstableEmptyDescription>
              {isFiltered ? "Adjust your search criteria." : "Create a template to get started."}
            </UnstableEmptyDescription>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      ) : (
        <>
          <UnstableTable>
            <UnstableTableHeader>
              <UnstableTableRow>
                <UnstableTableHead
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
                </UnstableTableHead>
                <UnstableTableHead
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
                </UnstableTableHead>
                <UnstableTableHead>URL</UnstableTableHead>
                <UnstableTableHead className="w-5" />
              </UnstableTableRow>
            </UnstableTableHeader>
            <UnstableTableBody>
              {isPending &&
                Array.from({ length: perPage }).map((_, i) => (
                  <UnstableTableRow key={`skeleton-${i + 1}`}>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-full" />
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-full" />
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-full" />
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-4" />
                    </UnstableTableCell>
                  </UnstableTableRow>
                ))}
              {!isPending &&
                templates?.map((template) => (
                  <UnstableTableRow key={`template-${template.id}`}>
                    <UnstableTableCell isTruncatable>{template.name}</UnstableTableCell>
                    <UnstableTableCell>
                      <span className="uppercase">{template.authMethod}</span>
                    </UnstableTableCell>
                    <UnstableTableCell isTruncatable>
                      {template.templateFields.url}
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <UnstableDropdownMenu>
                        <UnstableDropdownMenuTrigger asChild>
                          <UnstableIconButton
                            variant="ghost"
                            size="xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontalIcon />
                          </UnstableIconButton>
                        </UnstableDropdownMenuTrigger>
                        <UnstableDropdownMenuContent align="end">
                          <UnstableDropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePopUpOpen("viewUsages", { template });
                            }}
                          >
                            <EyeIcon />
                            {TEMPLATE_UI_LABELS.VIEW_USAGES}
                          </UnstableDropdownMenuItem>
                          <OrgPermissionCan
                            I={OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates}
                            a={OrgPermissionSubjects.MachineIdentityAuthTemplate}
                          >
                            {(isAllowed) => (
                              <UnstableDropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("editTemplate", { template });
                                }}
                                isDisabled={!isAllowed}
                              >
                                <EditIcon />
                                {TEMPLATE_UI_LABELS.EDIT_TEMPLATE}
                              </UnstableDropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                          <OrgPermissionCan
                            I={OrgPermissionMachineIdentityAuthTemplateActions.DeleteTemplates}
                            a={OrgPermissionSubjects.MachineIdentityAuthTemplate}
                          >
                            {(isAllowed) => (
                              <UnstableDropdownMenuItem
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
                              </UnstableDropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                        </UnstableDropdownMenuContent>
                      </UnstableDropdownMenu>
                    </UnstableTableCell>
                  </UnstableTableRow>
                ))}
            </UnstableTableBody>
          </UnstableTable>
          {totalCount > 0 && (
            <UnstablePagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={handlePerPageChange}
            />
          )}
        </>
      )}
    </div>
  );
};
