import { useState } from "react";
import {
  ChevronDownIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
  PageHeader,
  PageLoader,
  Pagination,
  ResourceIcon,
  RowLink,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortDirection,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import { getInstancePinningLink } from "@app/helpers/project";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  PkiApplicationOrderBy,
  TPkiApplication,
  useListPkiApplications
} from "@app/hooks/api/pkiApplications";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useDebounce } from "@app/hooks/useDebounce";
import { usePopUp } from "@app/hooks/usePopUp";
import { useResetPageHelper } from "@app/hooks/useResetPageHelper";

import { PkiDocsUrls } from "../pki-docs-urls";
import { ConfigureProfilesModal } from "./components/ConfigureProfilesModal";
import { PkiApplicationModal } from "./components/PkiApplicationModal";

const APPLICATIONS_TABLE = "pkiApplicationsTable";

export const ApplicationsPage = () => {
  const { currentProject } = useProject();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(APPLICATIONS_TABLE, PreferenceKey.PerPage, 20)
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [orderBy, setOrderBy] = useState(PkiApplicationOrderBy.CreatedAt);
  const [orderDirection, setOrderDirection] = useState(OrderByDirection.DESC);
  const offset = (page - 1) * perPage;
  const { data, isPending } = useListPkiApplications({
    limit: perPage,
    offset,
    search: debouncedSearch || undefined,
    orderBy,
    orderDirection
  });
  const applications = data?.applications;
  const totalCount = data?.total ?? 0;

  useResetPageHelper({ totalCount, offset, setPage });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference(APPLICATIONS_TABLE, PreferenceKey.PerPage, newPerPage);
  };

  const getSortDirection = (column: PkiApplicationOrderBy): TableSortDirection => {
    if (orderBy !== column) return "none";
    return orderDirection === OrderByDirection.ASC ? "ascending" : "descending";
  };

  const handleSortChange = (column: PkiApplicationOrderBy, direction: TableSortDirection) => {
    setOrderBy(column);
    setOrderDirection(direction === "descending" ? OrderByDirection.DESC : OrderByDirection.ASC);
    setPage(1);
  };

  const renderSortableHead = (column: PkiApplicationOrderBy, label: string, className: string) => (
    <TableHead
      className={className}
      sortDirection={getSortDirection(column)}
      onSortChange={(direction) => handleSortChange(column, direction)}
    >
      {label}
      <ChevronDownIcon
        className={twMerge(
          "size-3 transition-transform",
          getSortDirection(column) === "descending" && "rotate-180",
          orderBy !== column && "opacity-30"
        )}
      />
    </TableHead>
  );

  const { hasProjectRole } = useProjectPermission();
  const canCreateApplication = hasProjectRole("admin");
  const canConfigureProfiles = canCreateApplication;
  const [configureProfilesApp, setConfigureProfilesApp] = useState<TPkiApplication | null>(null);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["application"] as const);

  const renderApplications = () => {
    if (isPending) {
      return <PageLoader />;
    }
    if (!applications || applications.length === 0) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {debouncedSearch ? "No applications match search" : "No existing applications"}
            </EmptyTitle>
            <EmptyDescription>
              {debouncedSearch
                ? "Try adjusting your search"
                : "Create an application to issue certificates for a workload"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            {renderSortableHead(PkiApplicationOrderBy.Name, "Name", "w-full")}
            {renderSortableHead(
              PkiApplicationOrderBy.ProfileCount,
              "Profiles",
              "whitespace-nowrap"
            )}
            {renderSortableHead(PkiApplicationOrderBy.MemberCount, "Members", "whitespace-nowrap")}
            {renderSortableHead(
              PkiApplicationOrderBy.CertificateCount,
              "Certificates",
              "whitespace-nowrap"
            )}
            {renderSortableHead(PkiApplicationOrderBy.CreatedAt, "Created", "whitespace-nowrap")}
            <TableHead className="w-5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((app) => (
            <TableRow key={app.id} linked>
              <TableCell className="w-full">
                <div className="flex items-center gap-x-2 font-mono">
                  <ResourceIcon className="size-4 shrink-0 text-project" />
                  <RowLink
                    {...getInstancePinningLink(
                      currentProject.orgId,
                      currentProject,
                      `applications/${app.name}`
                    )!}
                  >
                    {app.name}
                  </RowLink>
                  {app.description?.length ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 shrink-0 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        {app.description}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">{app.profileCount}</TableCell>
              <TableCell className="whitespace-nowrap">{app.memberCount}</TableCell>
              <TableCell className="whitespace-nowrap">{app.certificateCount}</TableCell>
              <TableCell className="whitespace-nowrap text-accent">
                {new Date(app.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                {canConfigureProfiles ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton variant="ghost" size="xs" onClick={(e) => e.stopPropagation()}>
                        <MoreHorizontalIcon />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="min-w-40" align="end" sideOffset={2}>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfigureProfilesApp(app);
                        }}
                      >
                        <SlidersHorizontalIcon />
                        Configure Profiles
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <>
      <PageTitle title="Applications" />
      <div className="h-full bg-page">
        <div className="mx-auto flex flex-col text-foreground-inverse">
          <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
            <PageHeader
              scope={ProjectType.CertificateManager}
              icon={ResourceIcon}
              title="Applications"
              description="Issue certificates and manage lifecycle automation for your services."
            />

            <Card>
              <CardHeader className="gap-x-6">
                <CardTitle>
                  Applications
                  <DocumentationLinkBadge href={PkiDocsUrls.applications.overview} />
                </CardTitle>
                <CardDescription>
                  Each Application represents a service or workload that issues and manages its own
                  certificates.
                </CardDescription>
                {canCreateApplication ? (
                  <CardAction className="@xs:self-center">
                    <Button variant="project" onClick={() => handlePopUpOpen("application")}>
                      <PlusIcon />
                      Create Application
                    </Button>
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent>
                <InputGroup className="mb-4">
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search applications..."
                    aria-label="Search applications"
                    maxLength={255}
                  />
                </InputGroup>
                {renderApplications()}
                {totalCount > 0 ? (
                  <Pagination
                    count={totalCount}
                    page={page}
                    perPage={perPage}
                    onChangePage={setPage}
                    onChangePerPage={handlePerPageChange}
                  />
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <PkiApplicationModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />

      <ConfigureProfilesModal
        application={configureProfilesApp}
        isOpen={Boolean(configureProfilesApp)}
        onOpenChange={(open) => {
          if (!open) setConfigureProfilesApp(null);
        }}
      />
    </>
  );
};
