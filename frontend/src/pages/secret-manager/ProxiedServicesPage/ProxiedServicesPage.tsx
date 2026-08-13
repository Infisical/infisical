import { useState } from "react";
import { Helmet } from "react-helmet";
import { ArrowLeftRight, MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  CreateProxiedServiceModal,
  DeleteProxiedServiceModal,
  EditProxiedServiceModal
} from "@app/components/proxied-services";
import { PageHeader } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  ProjectPermissionProxiedServiceActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useDebounce, usePopUp } from "@app/hooks";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useListProxiedServices } from "@app/hooks/api/proxiedServices/queries";
import { TProxiedService } from "@app/hooks/api/proxiedServices/types";

export const ProxiedServicesPage = () => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id ?? "";
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "createService",
    "editService",
    "deleteService"
  ] as const);

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const { data, isPending } = useListProxiedServices({ projectId, search: debouncedSearch });
  const services = data?.services ?? [];

  return (
    <>
      <Helmet>
        <title>Proxied Services</title>
      </Helmet>
      <div className="mx-auto flex max-w-8xl flex-col">
        <PageHeader
          scope={ProjectType.SecretManager}
          title="Proxied Services"
          description="Define how an agent gateway applies credentials to traffic bound for an external service."
          icon={ArrowLeftRight}
        />
        <Card>
          <CardHeader>
            <CardTitle>Proxied Services</CardTitle>
            <CardDescription>
              A service maps one or more hosts to the credentials applied on the way out.
            </CardDescription>
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionProxiedServiceActions.Create}
                a={ProjectPermissionSub.ProxiedServices}
              >
                {(isAllowed) => (
                  <Button
                    variant="project"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpOpen("createService")}
                  >
                    Create Proxied Service
                  </Button>
                )}
              </ProjectPermissionCan>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Input
              className="mb-4"
              placeholder="Search services..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {!isPending && !services.length ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ArrowLeftRight />
                  </EmptyMedia>
                  <EmptyTitle>
                    {search ? "No services match your search" : "No proxied services yet"}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Hosts</TableHead>
                    <TableHead>Credentials</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((service) => (
                    <TableRow key={service.id}>
                      <TableCell>{service.name}</TableCell>
                      <TableCell className="font-mono text-xs text-mineshaft-300">
                        {service.hostPattern}
                      </TableCell>
                      <TableCell>{service.credentials.length}</TableCell>
                      <TableCell>
                        {service.isEnabled ? (
                          <Badge variant="success">Enabled</Badge>
                        ) : (
                          <Badge variant="danger">Disabled</Badge>
                        )}
                      </TableCell>
                      <TableCell className="w-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              variant="ghost"
                              size="xs"
                              aria-label="Proxied service options"
                            >
                              <MoreHorizontalIcon />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <ProjectPermissionCan
                              I={ProjectPermissionProxiedServiceActions.Edit}
                              a={ProjectPermissionSub.ProxiedServices}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  isDisabled={!isAllowed}
                                  onClick={() => handlePopUpOpen("editService", service)}
                                >
                                  <PencilIcon />
                                  Edit Proxied Service
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                            <ProjectPermissionCan
                              I={ProjectPermissionProxiedServiceActions.Delete}
                              a={ProjectPermissionSub.ProxiedServices}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  variant="danger"
                                  isDisabled={!isAllowed}
                                  onClick={() => handlePopUpOpen("deleteService", service)}
                                >
                                  <Trash2Icon />
                                  Delete Proxied Service
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      <CreateProxiedServiceModal
        isOpen={popUp.createService.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createService", isOpen)}
        projectId={projectId}
        existingNames={services.map((s) => s.name)}
      />
      <EditProxiedServiceModal
        isOpen={popUp.editService.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editService", isOpen)}
        proxiedService={popUp.editService.data as TProxiedService}
        projectId={projectId}
        existingNames={services.map((s) => s.name)}
      />
      <DeleteProxiedServiceModal
        isOpen={popUp.deleteService.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteService", isOpen)}
        proxiedService={popUp.deleteService.data as TProxiedService}
      />
    </>
  );
};
