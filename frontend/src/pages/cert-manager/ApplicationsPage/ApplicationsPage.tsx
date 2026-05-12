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
  CardHeader,
  CardTitle,
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
import { TPkiApplication, useListPkiApplications } from "@app/hooks/api/pkiApplications";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { ConfigureProfilesModal } from "./components/ConfigureProfilesModal";
import { PkiApplicationModal } from "./components/PkiApplicationModal";

export const ApplicationsPage = () => {
  const { projectId, orgId } = useParams({ strict: false });
  const navigate = useNavigate();
  const { data: applications, isPending } = useListPkiApplications();
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
            <EmptyTitle>No applications yet</EmptyTitle>
            <EmptyDescription>
              Create an Application to attach Profiles and grant access to a team.
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
              description="Issue certificates, configure enrollment, and manage lifecycle automation for your services."
            />

            <Card>
              <CardHeader>
                <CardTitle>Applications</CardTitle>
                {canCreateApplication ? (
                  <CardAction>
                    <Button variant="project" onClick={() => handlePopUpOpen("application")}>
                      <PlusIcon />
                      Create Application
                    </Button>
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent>{renderApplications()}</CardContent>
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
