import {
  Button,
  IconButton,
  Input,
  Tooltip,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel
} from "@app/components/v2";
import { getProjectTitle } from "@app/helpers/project";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowDownAZ,
  faArrowUpZA,
  faBorderAll,
  faList,
  faMagnifyingGlass
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ReactNode } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

export enum ResourceListScopeFilter {
  Personal = "personal",
  Global = "global"
}

export enum ResourceViewMode {
  GRID = "grid",
  LIST = "list"
}

export enum ProjectOrderBy {
  Name = "name"
}

type Props = {
  searchValue: string;
  onSearchChange: (val: string) => void;

  resourceListScope: ResourceListScopeFilter;
  onResourceListScopeChange: (value: ResourceListScopeFilter) => void;

  orderDirection: OrderByDirection;
  onOrderDirectionChange: (value: OrderByDirection) => void;

  resourceViewMode: ResourceViewMode;
  onResourceViewModeChange: (val: ResourceViewMode) => void;

  projectTypeFilter: Partial<Record<ProjectType, boolean>>;
  setProjectTypeFilter: (val: ProjectType) => void;

  children?: ReactNode;
};

export const Toolbar = ({
  resourceListScope: resourceListView,
  onSearchChange,
  searchValue,
  onResourceListScopeChange: onResourceListViewChange,
  orderDirection,
  onOrderDirectionChange,
  resourceViewMode,
  onResourceViewModeChange,
  projectTypeFilter = {},
  setProjectTypeFilter,
  children
}: Props) => {
  const isTableFilteredByType = Boolean(Object.values(projectTypeFilter).some((el) => el));
  const isGridDisabled = resourceListView === ResourceListScopeFilter.Global;

  return (
    <div className="flex w-full flex-row">
      <Input
        className="h-[2.3rem] bg-mineshaft-800 text-sm placeholder-mineshaft-50/60 duration-200 focus:bg-mineshaft-700/80"
        containerClassName="w-full"
        placeholder="Search by project name..."
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
      />
      <div className="mx-2 flex rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
        <Tooltip content="Toggle Sort Direction">
          <IconButton
            className="min-w-[2.4rem] border-none hover:bg-mineshaft-600"
            ariaLabel={`Sort ${
              orderDirection === OrderByDirection.ASC ? "descending" : "ascending"
            }`}
            variant="plain"
            size="xs"
            colorSchema="secondary"
            onClick={() =>
              onOrderDirectionChange(
                orderDirection === OrderByDirection.ASC
                  ? OrderByDirection.DESC
                  : OrderByDirection.ASC
              )
            }
          >
            <FontAwesomeIcon
              icon={orderDirection === OrderByDirection.ASC ? faArrowDownAZ : faArrowUpZA}
            />
          </IconButton>
        </Tooltip>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div
            className={twMerge(
              "ml-2 flex rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1",
              isTableFilteredByType && "border-primary-400 text-primary-400"
            )}
          >
            <Tooltip content="Choose visible project type" className="mb-2">
              <IconButton
                ariaLabel="project-types"
                className={twMerge(
                  "min-w-[2.4rem] border-none hover:bg-mineshaft-600",
                  isTableFilteredByType && "text-primary-400"
                )}
                variant="plain"
                size="xs"
                colorSchema="secondary"
              >
                <FontAwesomeIcon icon={faList} />
              </IconButton>
            </Tooltip>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="thin-scrollbar overflow-y-auto" align="end">
          <DropdownMenuLabel>Filter By Project Type</DropdownMenuLabel>
          {Object.values(ProjectType).map((el) => (
            <DropdownMenuItem
              key={`filter-item-${el}`}
              onClick={(e) => {
                e.preventDefault();
                setProjectTypeFilter(el);
              }}
              icon={projectTypeFilter?.[el] && <FontAwesomeIcon icon={faCheckCircle} />}
              iconPos="right"
            >
              <div className="flex items-center gap-2">
                <span>{getProjectTitle(el)}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
        <Button
          variant="outline_bg"
          onClick={() => {
            onResourceListViewChange(ResourceListScopeFilter.Personal);
          }}
          size="xs"
          className={`${
            resourceListView === ResourceListScopeFilter.Personal
              ? "bg-mineshaft-500"
              : "bg-transparent"
          } min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600`}
        >
          Personal
        </Button>
        <Button
          variant="outline_bg"
          onClick={() => {
            onResourceViewModeChange(ResourceViewMode.LIST);
            onResourceListViewChange(ResourceListScopeFilter.Global);
          }}
          size="xs"
          className={`${
            resourceListView === ResourceListScopeFilter.Global
              ? "bg-mineshaft-500"
              : "bg-transparent"
          } min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600`}
        >
          Global
        </Button>
      </div>
      <div className="ml-2 flex gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
        <IconButton
          variant="outline_bg"
          onClick={() => {
            localStorage.setItem("projectsViewMode", ResourceViewMode.GRID);
            onResourceViewModeChange(ResourceViewMode.GRID);
          }}
          isDisabled={isGridDisabled}
          ariaLabel="grid"
          size="xs"
          className={`${
            resourceViewMode === ResourceViewMode.GRID ? "bg-mineshaft-500" : "bg-transparent"
          } min-w-[2.4rem] border-none hover:bg-mineshaft-600`}
        >
          <FontAwesomeIcon icon={faBorderAll} />
        </IconButton>
        <IconButton
          variant="outline_bg"
          onClick={() => {
            localStorage.setItem("projectsViewMode", ResourceViewMode.LIST);
            onResourceViewModeChange(ResourceViewMode.LIST);
          }}
          ariaLabel="list"
          size="xs"
          className={`${
            resourceViewMode === ResourceViewMode.LIST ? "bg-mineshaft-500" : "bg-transparent"
          } min-w-[2.4rem] border-none hover:bg-mineshaft-600`}
        >
          <FontAwesomeIcon icon={faList} />
        </IconButton>
      </div>
      {children}
    </div>
  );
};
