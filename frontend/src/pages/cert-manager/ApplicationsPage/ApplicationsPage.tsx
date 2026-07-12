import { useState } from "react";
import { Helmet } from "react-helmet";
import { useNavigate, useParams } from "@tanstack/react-router";
import { InfoIcon, MoreHorizontalIcon, PlusIcon, SlidersHorizontalIcon } from "lucide-react";

import { PageHeader } from "@app/components/v2";
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
  PageLoader,
  Pagination,
  ResourceIcon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { TPkiApplication, useListPkiApplications } from "@app/hooks/api/pkiApplications";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";
import { useResetPageHelper } from "@app/hooks/useResetPageHelper";

import { PkiDocsUrls } from "../pki-docs-urls";
import { ConfigureProfilesModal } from "./components/ConfigureProfilesModal";
import { PkiApplicationModal } from "./components/PkiApplicationModal";

const APPLICATIONS_TABLE = "pkiApplicationsTable";

export const ApplicationsPage = () => {
  const { projectId, orgId } = useParams({ strict: false });
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(APPLICATIONS_TABLE, PreferenceKey.PerPage, 20)
  );
  const offset = (page - 1) * perPage;
  const { data, isPending } = useListPkiApplications({ limit: perPage, offset });
  const applications = data?.applications;
  const totalCount = data?.total ?? 0;

  useResetPageHelper({ totalCount, offset, setPage });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference(APPLICATIONS_TABLE, PreferenceKey.PerPage, newPerPage);
  };

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
            <EmptyTitle>No existing applications</EmptyTitle>
            <EmptyDescription>
              Create an application to issue certificates for a workload
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full">Name</TableHead>
            <TableHead className="whitespace-nowrap">Profiles</TableHead>
            <TableHead className="whitespace-nowrap">Members</TableHead>
            <TableHead className="whitespace-nowrap">Certificates</TableHead>
            <TableHead className="whitespace-nowrap">Created</TableHead>
            <TableHead className="w-5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((app) => (
            <TableRow
              key={app.id}
              className="cursor-pointer"
              onClick={() =>
                navigate({
                  to: "/organizations/$orgId/projects/cert-manager/$projectId/applications/$applicationName",
                  params: {
                    orgId: orgId ?? "",
                    projectId: projectId ?? "",
                    applicationName: app.name
                  }
                })
              }
            >
              <TableCell className="w-full">
                <div className="flex items-center gap-x-2 font-mono">
                  <ResourceIcon className="size-4 shrink-0 text-primary" />
                  <span>{app.name}</span>
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
      <Helmet>
        <title>Applications</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="mx-auto flex flex-col text-white">
          <div className="mx-auto mb-6 w-full max-w-8xl">
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
