import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BoxIcon,
  FileBadgeIcon,
  MoreHorizontalIcon,
  StarIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  PageLoader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useOrgPermission } from "@app/context";
import {
  OrgPermissionCertManagerActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  certManagerInstanceKeys,
  TCertManagerLegacyInstance,
  useCertManagerInstanceState,
  useCertManagerLegacyInstances,
  useSetCertManagerActiveProject
} from "@app/hooks/api/certManagerInstance";
import { useDeleteWorkspace } from "@app/hooks/api/projects";

import { CertManagerExportProjectModal } from "./CertManagerExportProjectModal";

export const OrgCertManagerTab = () => {
  const queryClient = useQueryClient();
  const { permission } = useOrgPermission();
  const canManage = permission.can(
    OrgPermissionCertManagerActions.ManageInstance,
    OrgPermissionSubjects.CertManager
  );

  const { data: instanceState } = useCertManagerInstanceState();
  const { data: legacyData, isPending } = useCertManagerLegacyInstances();
  const setActive = useSetCertManagerActiveProject();
  const deleteWorkspace = useDeleteWorkspace();

  const instances = legacyData?.instances ?? [];
  const isMultiInstance = Boolean(instanceState?.isMultiInstance);

  const [pendingActive, setPendingActive] = useState<TCertManagerLegacyInstance | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TCertManagerLegacyInstance | null>(null);
  const [pendingExport, setPendingExport] = useState<TCertManagerLegacyInstance | null>(null);

  const activeInstance = instances.find((i) => i.isActive) ?? null;

  useEffect(() => {
    if (pendingDelete && !instances.find((i) => i.id === pendingDelete.id)) {
      setPendingDelete(null);
    }
    if (pendingActive && !instances.find((i) => i.id === pendingActive.id)) {
      setPendingActive(null);
    }
    if (pendingExport && !instances.find((i) => i.id === pendingExport.id)) {
      setPendingExport(null);
    }
  }, [instances, pendingDelete, pendingActive, pendingExport]);

  if (isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <FileBadgeIcon className="size-4 text-accent" />
            Certificate Manager
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
  if (instances.length <= 1) return null;

  const handleConfirmActive = async () => {
    if (!pendingActive) return;
    try {
      await setActive.mutateAsync(pendingActive.id);
      createNotification({
        type: "success",
        text: `${pendingActive.name} is now the active Certificate Manager project for the organization.`
      });
      setPendingActive(null);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to switch active project.";
      createNotification({ type: "error", text: detail });
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteWorkspace.mutateAsync({ projectID: pendingDelete.id });
      createNotification({
        type: "success",
        text: `${pendingDelete.name} has been deleted.`
      });
      await queryClient.invalidateQueries({ queryKey: certManagerInstanceKeys.all });
      setPendingDelete(null);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to delete project.";
      createNotification({ type: "error", text: detail });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <FileBadgeIcon className="size-4 text-accent" />
            Certificate Manager
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isMultiInstance && (
            <Alert variant="warning" className="mb-4">
              <TriangleAlertIcon />
              <AlertDescription>
                <p>
                  Your organization has multiple Certificate Manager projects. Going forward, only
                  one project per organization is supported. Select your active project and remove
                  the others once migrated.{" "}
                  <a
                    href="https://infisical.com/docs/documentation/platform/pki/migration"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-mineshaft-200"
                  >
                    Learn more →
                  </a>
                </p>
              </AlertDescription>
            </Alert>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-full">Project</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((instance) => (
                <TableRow key={instance.id}>
                  <TableCell className="w-full">
                    <div className="flex items-center gap-x-2">
                      <BoxIcon className="size-4 shrink-0 text-project" />
                      <span className="font-mono">{instance.name}</span>
                      <span className="font-mono text-xs text-accent">{instance.slug}</span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {instance.isActive ? <Badge variant="success">Active</Badge> : null}
                  </TableCell>
                  <TableCell>
                    {canManage && !instance.isActive ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            variant="ghost"
                            size="xs"
                            aria-label={`Manage ${instance.name}`}
                          >
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="min-w-56" align="end" sideOffset={2}>
                          <DropdownMenuItem onClick={() => setPendingExport(instance)}>
                            <UploadIcon />
                            Export to active project
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPendingActive(instance)}>
                            <StarIcon />
                            Set as active
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="danger"
                            onClick={() => setPendingDelete(instance)}
                          >
                            <Trash2Icon />
                            Delete project
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(pendingActive)}
        onOpenChange={(open) => {
          if (!open) setPendingActive(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm change</DialogTitle>
            <DialogDescription>
              This changes the default Certificate Manager for the entire organization.
            </DialogDescription>
          </DialogHeader>

          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              <p>
                <span className="font-semibold">{pendingActive?.name ?? ""}</span> will become the
                default for your organization. All members and integrations will resolve to this
                project going forward.
              </p>
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingActive(null)}>
              Cancel
            </Button>
            <Button variant="project" isPending={setActive.isPending} onClick={handleConfirmActive}>
              Confirm change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteActionModal
        isOpen={Boolean(pendingDelete)}
        onChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete?.name ?? "this project"}?`}
        subTitle="This permanently deletes the Certificate Manager project, including its certificates, profiles, applications, and approval policies. This cannot be undone."
        deleteKey={pendingDelete?.slug ?? "delete"}
        onDeleteApproved={handleConfirmDelete}
        buttonText="Delete project"
      />

      <CertManagerExportProjectModal
        isOpen={Boolean(pendingExport)}
        onOpenChange={(open) => {
          if (!open) setPendingExport(null);
        }}
        source={pendingExport}
        activeInstance={activeInstance}
      />
    </>
  );
};
