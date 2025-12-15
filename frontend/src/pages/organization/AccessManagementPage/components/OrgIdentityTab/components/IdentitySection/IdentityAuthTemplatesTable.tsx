import {
  faArrowDown,
  faArrowUp,
  faBan,
  faEdit,
  faEllipsisV,
  faEye,
  faMagnifyingGlass,
  faServer,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import {
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
  Tr
} from "@app/components/v2";
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
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
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

  const { data, isPending, isFetching } = useGetIdentityAuthTemplates({
    organizationId,
    limit,
    offset,
    search: debouncedSearch,
    isDisabled: !subscription.get(
      SubscriptionProductCategory.Platform,
      "machineIdentityAuthTemplates"
    )
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

  return (
    <div>
      <div className="mb-4 flex items-center space-x-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search templates by name..."
        />
      </div>
      <TableContainer>
        <Table>
          <THead>
            <Tr className="h-14">
              <Th className="w-1/6">
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className={`ml-2 ${orderBy === TemplatesOrderBy.Name ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort(TemplatesOrderBy.Name)}
                  >
                    <FontAwesomeIcon
                      icon={
                        orderDirection === OrderByDirection.DESC &&
                        orderBy === TemplatesOrderBy.Name
                          ? faArrowUp
                          : faArrowDown
                      }
                    />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/6">
                <div className="flex items-center">
                  Method
                  <IconButton
                    variant="plain"
                    className={`ml-2 ${orderBy === TemplatesOrderBy.AuthMethod ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort(TemplatesOrderBy.AuthMethod)}
                  >
                    <FontAwesomeIcon
                      icon={
                        orderDirection === OrderByDirection.DESC &&
                        orderBy === TemplatesOrderBy.AuthMethod
                          ? faArrowUp
                          : faArrowDown
                      }
                    />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-2/3">URL</Th>
              <Th className="w-16">{isFetching ? <Spinner size="xs" /> : null}</Th>
            </Tr>
          </THead>
          <TBody>
            {subscription.get(
              SubscriptionProductCategory.Platform,
              "machineIdentityAuthTemplates"
            ) &&
              isPending && <TableSkeleton columns={4} innerKey="identity-auth-templates" />}

            {!isPending &&
              templates?.map((template) => (
                <Tr
                  className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                  key={`template-${template.id}`}
                >
                  <Td>{template.name}</Td>
                  <Td>
                    <div className="flex items-center">
                      <span className="uppercase">{template.authMethod}</span>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-sm text-mineshaft-400">
                      {template.templateFields.url}
                    </span>
                  </Td>
                  <Td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton
                          ariaLabel="Options"
                          className="w-6"
                          colorSchema="secondary"
                          variant="plain"
                        >
                          <FontAwesomeIcon icon={faEllipsisV} />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent sideOffset={2} align="end">
                        <DropdownMenuItem
                          icon={<FontAwesomeIcon icon={faEye} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePopUpOpen("viewUsages", { template });
                          }}
                        >
                          {TEMPLATE_UI_LABELS.VIEW_USAGES}
                        </DropdownMenuItem>
                        <OrgPermissionCan
                          I={OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates}
                          a={OrgPermissionSubjects.MachineIdentityAuthTemplate}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              icon={<FontAwesomeIcon icon={faEdit} />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("editTemplate", { template });
                              }}
                              isDisabled={!isAllowed}
                            >
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
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("deleteTemplate", {
                                  templateId: template.id,
                                  name: template.name
                                });
                              }}
                              isDisabled={!isAllowed}
                              icon={<FontAwesomeIcon icon={faTrash} />}
                            >
                              {TEMPLATE_UI_LABELS.DELETE_TEMPLATE}
                            </DropdownMenuItem>
                          )}
                        </OrgPermissionCan>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
        {!isPending && data && totalCount > 0 && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!subscription.get(
          SubscriptionProductCategory.Platform,
          "machineIdentityAuthTemplates"
        ) && (
          <EmptyState title="This feature has not been activated for your license." icon={faBan} />
        )}
        {!isPending && templates.length === 0 && (
          <EmptyState
            title={
              debouncedSearch.trim().length > 0
                ? "No templates match search filter"
                : "No identity auth templates have been created"
            }
            icon={faServer}
          />
        )}
      </TableContainer>
    </div>
  );
};
