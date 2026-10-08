import { useNavigate } from "@tanstack/react-router";
import { BoxIcon, ExternalLinkIcon, RadarIcon, TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  IconButton,
  PageLoader,
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
import { useOrganization, useOrgPermission } from "@app/context";
import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useGetUserProjects } from "@app/hooks/api";
import { useOrgAdminAccessProject } from "@app/hooks/api/orgAdmin/mutation";
import {
  TSecretScanningInstanceProject,
  useGetSecretScanningInstanceState
} from "@app/hooks/api/secretScanningV2";

export const OrgSecretScanningTab = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const isOrgAdmin = permission.can(
    OrgPermissionAdminConsoleAction.AccessAllProjects,
    OrgPermissionSubjects.AdminConsole
  );

  const { data: instanceState, isPending } = useGetSecretScanningInstanceState(currentOrg.id);
  const { data: userProjects = [] } = useGetUserProjects();
  const orgAdminAccessProject = useOrgAdminAccessProject();

  const projects = instanceState?.projects ?? [];

  if (isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <RadarIcon className="size-4 text-accent" />
            Secret Scanning
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32">
            <PageLoader lottieClassName="w-16" />
          </div>
        </CardContent>
      </Card>
    );
  }
  if (projects.length <= 1) return null;

  const isMember = (projectId: string) => userProjects.some((p) => p.id === projectId);

  const handleOpen = async (project: TSecretScanningInstanceProject) => {
    if (!isMember(project.id)) {
      try {
        await orgAdminAccessProject.mutateAsync({ projectId: project.id });
      } catch {
        // The global mutation error handler already reports the failure.
        return;
      }
    }
    navigate({
      to: "/organizations/$orgId/projects/secret-scanning/$projectId/data-sources",
      params: { orgId: currentOrg.id, projectId: project.id }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <RadarIcon className="size-4 text-accent" />
          Secret Scanning
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Alert variant="warning" className="mb-4">
          <TriangleAlertIcon />
          <AlertDescription>
            <p>
              Your organization has multiple Secret Scanning projects. Going forward, only one
              project per organization is supported, and the most recently created project is the
              active one.
            </p>
          </AlertDescription>
        </Alert>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full">Project</TableHead>
              <TableHead className="whitespace-nowrap">Status</TableHead>
              <TableHead className="w-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => {
              const isActive = project.id === instanceState?.activeProjectId;
              const canOpen = isMember(project.id) || isOrgAdmin;

              return (
                <TableRow key={project.id}>
                  <TableCell className="w-full">
                    <div className="flex items-center gap-x-2">
                      <BoxIcon className="size-4 shrink-0 text-project" />
                      <span className="font-mono">{project.name}</span>
                      <span className="font-mono text-xs text-accent">{project.slug}</span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {isActive ? <Badge variant="success">Active</Badge> : null}
                  </TableCell>
                  <TableCell>
                    {canOpen ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <IconButton
                            variant="ghost"
                            size="xs"
                            aria-label={`Open ${project.name}`}
                            isPending={
                              orgAdminAccessProject.isPending &&
                              orgAdminAccessProject.variables?.projectId === project.id
                            }
                            onClick={() => handleOpen(project)}
                          >
                            <ExternalLinkIcon />
                          </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>Open project</TooltipContent>
                      </Tooltip>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
