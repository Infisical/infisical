import { Helmet } from "react-helmet";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Hexagon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, PageHeader, Spinner } from "@app/components/v2";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  TPkiApplication,
  useDeletePkiApplication,
  useListPkiApplications
} from "@app/hooks/api/pkiApplications";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { PkiApplicationModal } from "./components/PkiApplicationModal";

export const ApplicationsPage = () => {
  const { projectId, orgId } = useParams({ strict: false });
  const navigate = useNavigate();
  const { data: applications, isPending } = useListPkiApplications();
  const deleteApp = useDeletePkiApplication();

  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "application",
    "deleteApplication"
  ] as const);

  const renderApplications = () => {
    if (isPending) {
      return (
        <div className="flex items-center justify-center p-8">
          <Spinner />
        </div>
      );
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
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Profiles</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Certificates</TableHead>
            <TableHead>Created</TableHead>
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
                  to: `/organizations/${orgId ?? ""}/projects/cert-manager/${projectId ?? ""}/applications/${app.name}` as never
                } as never)
              }
            >
              <TableCell isTruncatable>
                <div className="flex items-center gap-x-2 font-mono">
                  <Hexagon className="size-5 shrink-0 text-primary" strokeWidth={1.75} />
                  <span>{app.name}</span>
                </div>
              </TableCell>
              <TableCell isTruncatable className="text-accent">
                {app.description?.length ? app.description : "—"}
              </TableCell>
              <TableCell>{app.profileCount}</TableCell>
              <TableCell>{app.memberCount}</TableCell>
              <TableCell>{app.certificateCount}</TableCell>
              <TableCell className="text-accent">
                {new Date(app.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
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
                        handlePopUpOpen("application", app);
                      }}
                    >
                      <PencilIcon />
                      Edit Application
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePopUpOpen("deleteApplication", app);
                      }}
                    >
                      <Trash2Icon />
                      Delete Application
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
              title="Applications"
              description="Applications attach one or more Profiles and a team. Each Application has its own members, roles, certificates, alerts, and approval policies."
            />

            <Card>
              <CardHeader>
                <CardTitle>Applications</CardTitle>
                <CardAction>
                  <Button variant="project" onClick={() => handlePopUpOpen("application")}>
                    <PlusIcon />
                    Create Application
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>{renderApplications()}</CardContent>
            </Card>
          </div>
        </div>
      </div>

      <PkiApplicationModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />

      <DeleteActionModal
        isOpen={popUp.deleteApplication.isOpen}
        title={`Delete ${(popUp.deleteApplication.data as TPkiApplication | undefined)?.name ?? "Application"}?`}
        subTitle="This unattaches all Profiles, app-scoped syncs/alerts, and revokes app-only memberships. Issued certificates remain in the project but lose their Application tag."
        onChange={(isOpen) => handlePopUpToggle("deleteApplication", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={async () => {
          const app = popUp.deleteApplication.data as TPkiApplication | undefined;
          if (!app) return;
          try {
            await deleteApp.mutateAsync({ applicationId: app.id });
            createNotification({ type: "success", text: `Deleted ${app.name}` });
            handlePopUpClose("deleteApplication");
          } catch (err) {
            const detail = err instanceof Error ? err.message : "Failed to delete Application.";
            createNotification({ type: "error", text: detail });
          }
        }}
      />
    </>
  );
};
