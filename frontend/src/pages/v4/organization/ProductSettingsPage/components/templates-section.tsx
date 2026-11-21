import { useState } from "react";
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
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline } from "@infisical/cipher/ui/layout";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import { ProjectTemplatesUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type { ProjectType } from "@app/hooks/api/projects/types";
import { InfisicalProjectTemplate, type TProjectTemplate } from "@app/hooks/api/projectTemplates";

import { useOrgId, useOrgPermission } from "../../../access/permissions";
import { failed, saved } from "../../../access/toast";
import { ListToolbar, RESTRICTED, usePagedList } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { useUpgradeGate } from "../../../license";
import { useGo } from "../../../links";
import { TemplateDetailsDialog } from "./template-details-dialog";

import styles from "./product-settings.module.css";

const Count = ({ names }: { names: readonly string[] }) =>
  names.length ? (
    <Tooltip content={names.join(", ")}>
      <span className={styles.count} data-row-interactive>
        {names.length}
      </span>
    </Tooltip>
  ) : (
    <span className={styles.muted}>0</span>
  );

const identityNames = (template: TProjectTemplate) => [
  ...(template.projectManagedIdentities ?? []).map((identity) => identity.name),
  ...(template.identities ?? []).map((identity) => identity.identityName)
];

export const ProjectTemplatesSection = ({
  projectType,
  templateHref
}: {
  projectType: ProjectType;
  templateHref: (templateId: string) => string;
}) => {
  const orgId = useOrgId();
  const go = useGo();
  const productSettings = useV4Adapter("productSettings");
  const { permission } = useOrgPermission();
  const { data: subscription } = productSettings.useSubscription(orgId);
  const licensed = Boolean(subscription?.projectTemplates);
  const { data: templates = [], isPending } = productSettings.useProjectTemplates({
    enabled: licensed
  });
  const deleteTemplate = productSettings.useDeleteProjectTemplate();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TProjectTemplate>();
  const canCreate = permission.can(
    OrgPermissionActions.Create,
    OrgPermissionSubjects.ProjectTemplates
  );
  const canDelete = permission.can(
    OrgPermissionActions.Delete,
    OrgPermissionSubjects.ProjectTemplates
  );
  const ofType = templates.filter((template) => template.type === projectType);
  const list = usePagedList<TProjectTemplate>({
    rows: ofType,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (template, needle) => template.name.toLowerCase().includes(needle),
    compare: (a, b, column) => {
      if (column === "roles") return a.roles.length - b.roles.length;
      return a.name.localeCompare(b.name);
    }
  });

  const columns: DataTableColumn<TProjectTemplate>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      sortable: true,
      minWidth: 240,
      text: (template) => template.name,
      render: (template) => (
        <RowLink link={go.link(templateHref(template.id))} title={template.name}>
          {template.name}
        </RowLink>
      ),
      secondary: (template) => template.description || undefined
    },
    {
      id: "roles",
      header: "Roles",
      width: 96,
      sortable: true,
      render: (template) => <Count names={template.roles.map((role) => role.name)} />
    },
    {
      id: "users",
      header: "Users",
      width: 96,
      render: (template) => <Count names={(template.users ?? []).map((user) => user.username)} />
    },
    {
      id: "groups",
      header: "Groups",
      width: 96,
      render: (template) => (
        <Count names={(template.groups ?? []).map((group) => group.groupSlug)} />
      )
    },
    {
      id: "identities",
      header: "Machine identities",
      width: 160,
      render: (template) => <Count names={identityNames(template)} />
    }
  ];

  const add = () => {
    if (!licensed) {
      openUpgradeGate({
        intent: { ...ProjectTemplatesUpgradeIntent, isEnterpriseFeature: true },
        paywallKey: "organization.project-templates"
      });
      return;
    }
    setCreating(true);
  };

  const remove = async (template: TProjectTemplate) => {
    try {
      await deleteTemplate.mutateAsync({ templateId: template.id });
      saved(`Project template "${template.name}" deleted`);
    } catch (error) {
      failed("Failed to delete project template", error);
    }
  };

  const loading = licensed && isPending;
  return (
    <>
      <SettingsCard
        flush
        title="Project templates"
        description="Projects created from a template start with its roles, members and machine identities."
        action={
          <Inline gap={8} wrap={false}>
            <ListToolbar
              search={list.search}
              onSearch={list.setSearch}
              placeholder="Search templates"
            />
            <Button
              variant="accent"
              icon="plus"
              disabledReason={canCreate ? undefined : RESTRICTED}
              onClick={add}
            >
              Add template
            </Button>
          </Inline>
        }
      >
        {loading || list.filtered.length > 0 ? (
          <DataTable
            label="Project templates"
            rows={list.pageRows}
            columns={columns}
            loading={loading}
            loadingRows={4}
            sort={list.sort}
            onSortChange={list.setSort}
            getRowId={(template) => template.id}
            rowLabel={(template) => template.name}
            pagination={loading ? undefined : list.pagination}
            rowActions={{
              renderMenu: (template) => {
                const reason =
                  (template.name === InfisicalProjectTemplate.Default &&
                    "The default template cannot be deleted") ||
                  (canDelete ? undefined : RESTRICTED);
                return (
                  <>
                    <DropdownMenuItem onSelect={() => go(templateHref(template.id))}>
                      <Icon name="pencil" />
                      Edit template
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={Boolean(reason)}
                      description={reason || undefined}
                      onSelect={() => setDeleting(template)}
                    >
                      <Icon name="trash" />
                      Delete template
                    </DropdownMenuItem>
                  </>
                );
              }
            }}
          />
        ) : (
          <EmptyState
            size="sm"
            icon={ofType.length ? "search" : "layout-grid"}
            title={
              (!licensed && "Project templates are not included in your plan") ||
              (ofType.length ? "No templates match search" : "No project templates")
            }
          />
        )}
      </SettingsCard>
      {creating && (
        <TemplateDetailsDialog
          projectType={projectType}
          onOpenChange={setCreating}
          onComplete={(template) => go(templateHref(template.id))}
        />
      )}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete "${deleting?.name ?? "template"}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Projects already created from it keep their settings. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) remove(deleting);
                setDeleting(undefined);
              }}
            >
              Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {upgradeGate}
    </>
  );
};
