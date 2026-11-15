import { useState } from "react";
import { Alert, AlertDescription } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Meta } from "@infisical/cipher/ui/text";

import {
  OrgPermissionActions,
  OrgPermissionAdminConsoleAction,
  OrgPermissionCertManagerActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type {
  TCertManagerLegacyInstance,
  TExportCertManagerProjectResult
} from "@app/hooks/api/certManagerInstance";
import { ProjectType } from "@app/hooks/api/projects/types";
import type { TSecretScanningInstanceProject } from "@app/hooks/api/secretScanningV2/queries";

import { useOrgId, useOrgPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo } from "../../links";
import { productOf } from "../../shell/navigation";

const TEMPLATE_PRODUCTS = [ProjectType.SecretManager, ProjectType.KMS];

const templatesHref = (orgId: string, type: ProjectType) =>
  type === ProjectType.SecretManager
    ? orgHref(orgId, "/projects/secret-management/product-settings")
    : orgHref(orgId, `/projects/product-settings/${productOf(type).slug}`);

const plural = (count: number, singular: string, pluralForm: string) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

const ProjectName = ({ name, slug }: { name: string; slug: string }) => (
  <Inline gap={8} align="center" wrap={false}>
    <span>{name}</span>
    <Meta>{slug}</Meta>
  </Inline>
);

const ExportDialog = ({
  source,
  active,
  onClose
}: {
  source?: TCertManagerLegacyInstance;
  active?: TCertManagerLegacyInstance;
  onClose: () => void;
}) => {
  const exportProject = useV4Adapter("orgSettings").useExportCertManagerProject();
  const [result, setResult] = useState<TExportCertManagerProjectResult>();
  const [pending, setPending] = useState(false);
  const close = () => {
    setResult(undefined);
    onClose();
  };
  const renamed =
    result &&
    result.renamedCertificateAuthorities.length +
      result.renamedCertificatePolicies.length +
      result.renamedCertificateProfiles.length >
      0;
  return (
    <Dialog
      open={Boolean(source)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>
            {result ? "Export complete" : "Export Certificate Manager project"}
          </DialogTitle>
          <DialogDescription>
            {result &&
              `${plural(result.exportedCertificateAuthorities, "certificate authority", "certificate authorities")}, ${plural(result.exportedCertificatePolicies, "policy", "policies")}, and ${plural(result.exportedCertificateProfiles, "profile", "profiles")} from ${source?.name ?? ""} were exported to ${active?.name ?? ""}.${renamed ? " Some resources had name conflicts and were renamed automatically." : ""}`}
            {!result &&
              (active
                ? `All certificate authorities, policies, and profiles from ${source?.name ?? ""} will be copied into ${active.name}.`
                : "No active Certificate Manager project is set for this organization. An organization admin must choose one before exporting.")}
          </DialogDescription>
        </DialogHeader>
        {!result && (
          <Alert tone="info">
            <AlertDescription>
              External certificate authorities and related profiles are not included in this export
              and will be skipped.
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          {result ? (
            <Button variant="outline" onClick={close}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" disabled={pending} onClick={close}>
                Cancel
              </Button>
              <Button
                loading={pending}
                disabledReason={
                  active && source?.id !== active.id ? undefined : "Set an active project first"
                }
                onClick={async () => {
                  if (!source) return;
                  setPending(true);
                  try {
                    const next = await exportProject.mutateAsync({ sourceProjectId: source.id });
                    setResult(next);
                    saved(
                      `Exported ${next.exportedCertificateAuthorities} CAs, ${next.exportedCertificatePolicies} policies and ${next.exportedCertificateProfiles} profiles`
                    );
                  } catch (error) {
                    failed("Failed to export project", error);
                  } finally {
                    setPending(false);
                  }
                }}
              >
                Export to active project
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CertManagerInstances = () => {
  const orgId = useOrgId();
  const { permission } = useOrgPermission();
  const adapter = useV4Adapter("orgSettings");
  const { data: state } = useV4Adapter("certificates").useInstanceState(orgId);
  const { data } = adapter.useCertManagerLegacyInstances(orgId);
  const setActive = adapter.useSetCertManagerActiveProject();
  const deleteProject = adapter.useDeleteCertManagerProject();
  const [activating, setActivating] = useState<TCertManagerLegacyInstance>();
  const [deleting, setDeleting] = useState<TCertManagerLegacyInstance>();
  const [exporting, setExporting] = useState<TCertManagerLegacyInstance>();
  const [pending, setPending] = useState(false);
  const canManage = permission.can(
    OrgPermissionCertManagerActions.ManageInstance,
    OrgPermissionSubjects.CertManager
  );
  const instances = data?.instances ?? [];
  if (instances.length <= 1) return null;
  const active = instances.find((entry) => entry.isActive);

  const run = async (action: () => Promise<unknown>, success: string, failure: string) => {
    setPending(true);
    try {
      await action();
      saved(success);
      return true;
    } catch (error) {
      failed(failure, error);
      return false;
    } finally {
      setPending(false);
    }
  };

  const columns: DataTableColumn<TCertManagerLegacyInstance>[] = [
    {
      id: "project",
      header: "Project",
      primary: true,
      text: (row) => row.name,
      render: (row) => <ProjectName name={row.name} slug={row.slug} />
    },
    {
      id: "status",
      header: "Status",
      width: 120,
      render: (row) => (row.isActive ? <Badge tone="ok">Active</Badge> : null)
    }
  ];

  return (
    <>
      <Card variant="framed" title="Certificate Manager" flush>
        {state?.isMultiInstance && (
          <Alert tone="warn">
            <AlertDescription>
              Your organization has multiple Certificate Manager projects. Only one project per
              organization is supported going forward, so choose your active project and remove the
              others once migrated.{" "}
              <a
                href="https://infisical.com/docs/documentation/platform/pki/migration"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the migration guide
              </a>
            </AlertDescription>
          </Alert>
        )}
        <DataTable
          label="Certificate Manager projects"
          rows={instances}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          rowActions={{
            menuDisabledReason: (row) => {
              if (!canManage) return "Access restricted";
              return row.isActive ? "This is the active project" : undefined;
            },
            renderMenu: (row) => (
              <>
                <DropdownMenuItem onSelect={() => setExporting(row)}>
                  <Icon name="upload" />
                  Export to active project
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setActivating(row)}>
                  <Icon name="flag" />
                  Set as active
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
                  <Icon name="trash" />
                  Delete project
                </DropdownMenuItem>
              </>
            )
          }}
        />
      </Card>
      <Dialog open={Boolean(activating)} onOpenChange={(open) => !open && setActivating(undefined)}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>Make {activating?.name} the active project?</DialogTitle>
            <DialogDescription>
              All members and integrations resolve to this project going forward.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setActivating(undefined)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={async () => {
                if (!activating) return;
                const ok = await run(
                  () => setActive.mutateAsync(activating.id),
                  `${activating.name} is now the active Certificate Manager project`,
                  "Failed to switch active project"
                );
                if (ok) setActivating(undefined);
              }}
            >
              Confirm change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={deleting?.slug} pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the project, including its certificates, profiles,
              applications and approval policies. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                if (!deleting) return;
                const ok = await run(
                  () => deleteProject.mutateAsync({ projectId: deleting.id }),
                  `${deleting.name} has been deleted`,
                  "Failed to delete project"
                );
                if (ok) setDeleting(undefined);
              }}
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ExportDialog source={exporting} active={active} onClose={() => setExporting(undefined)} />
    </>
  );
};

const SecretScanningInstances = () => {
  const orgId = useOrgId();
  const go = useGo();
  const { permission } = useOrgPermission();
  const { data: state } = useV4Adapter("secretScanning").useInstanceState(orgId);
  const projects = useV4Adapter("projects");
  const { data: userProjects = [] } = projects.useUserProjects();
  const adminAccess = projects.useOrgAdminAccessProject();
  const [opening, setOpening] = useState<string>();
  const isOrgAdmin = permission.can(
    OrgPermissionAdminConsoleAction.AccessAllProjects,
    OrgPermissionSubjects.AdminConsole
  );
  const instances = state?.projects ?? [];
  if (instances.length <= 1) return null;
  const isMember = (projectId: string) => userProjects.some((entry) => entry.id === projectId);
  const href = (projectId: string) =>
    orgHref(orgId, `/projects/secret-scanning/${projectId}/data-sources`);

  const open = async (project: TSecretScanningInstanceProject) => {
    if (!isMember(project.id)) {
      setOpening(project.id);
      try {
        await adminAccess.mutateAsync({ projectId: project.id });
      } catch (error) {
        failed(`Failed to open ${project.name}`, error);
        return;
      } finally {
        setOpening(undefined);
      }
    }
    go(href(project.id));
  };

  const columns: DataTableColumn<TSecretScanningInstanceProject>[] = [
    {
      id: "project",
      header: "Project",
      primary: true,
      text: (row) => row.name,
      render: (row) => <ProjectName name={row.name} slug={row.slug} />
    },
    {
      id: "status",
      header: "Status",
      width: 120,
      render: (row) => (row.id === state?.activeProjectId ? <Badge tone="ok">Active</Badge> : null)
    }
  ];

  return (
    <Card variant="framed" title="Secret Scanning" flush>
      <Alert tone="warn">
        <AlertDescription>
          Secret Scanning no longer uses projects. Opening Secret Scanning takes everyone to the
          most recently created project below. The earlier ones stay available from their links.
        </AlertDescription>
      </Alert>
      <DataTable
        label="Secret Scanning projects"
        rows={instances}
        columns={columns}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.name}
        rowActions={{
          inline: [
            {
              label: (row) => (opening === row.id ? `Opening ${row.name}` : `Open ${row.name}`),
              icon: "external",
              onSelect: (row) => open(row),
              disabledReason: (row) =>
                isMember(row.id) || isOrgAdmin ? undefined : "You are not a member of this project"
            }
          ]
        }}
      />
    </Card>
  );
};

const ProjectTemplates = () => {
  const orgId = useOrgId();
  return (
    <Card
      title="Project templates"
      footer={
        <Inline gap={8}>
          {TEMPLATE_PRODUCTS.map((type) => (
            <Button key={type} variant="outline" asChild>
              <a href={templatesHref(orgId, type)}>{productOf(type).label}</a>
            </Button>
          ))}
        </Inline>
      }
      description="Project templates are managed in each product's settings."
    />
  );
};

export const ProductSettingsTab = () => {
  const { permission } = useOrgPermission();
  return (
    <Stack gap={24}>
      <PageHeader title="Product settings" />
      {permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.ProjectTemplates) && (
        <ProjectTemplates />
      )}
      <CertManagerInstances />
      <SecretScanningInstances />
    </Stack>
  );
};
