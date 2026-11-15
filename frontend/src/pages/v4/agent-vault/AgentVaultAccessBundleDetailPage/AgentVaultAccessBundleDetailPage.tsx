import { useMemo, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { HeaderSearch } from "@infisical/cipher/ui/header-search";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";

import {
  hostPatternOf,
  SERVICE_TYPE_LABELS
} from "@app/components/agent-vault/service-sheet/serviceSchema";
import { PageTitle } from "@app/components/PageTitle";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { AgentVaultSessionScope } from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultBundleSkill, TAgentVaultService } from "@app/hooks/api/agentVault/types";
import { useAgentVaultCreateIntent } from "@app/hooks/useAgentVaultCreateIntent";
import { useAgentVaultSheetState } from "@app/hooks/useAgentVaultSheetState";

import { BackButton } from "../../access/org/detail-parts";
import { useProjectPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { AccessBundleDialog, DeleteAccessBundleDialog } from "../resources/access-bundle-dialogs";
import { AddBundleServicesDialog, AddBundleSkillsDialog } from "../resources/add-to-bundle-dialogs";
import { targetOf, AgentVaultDocs, useIsAgentVaultAdmin } from "../resources/agent-vault-utils";
import { ManageAccessSheet } from "../resources/manage-access-sheet";
import { PersonalValuesDialog } from "../resources/personal-values-dialog";
import { ServiceSheet } from "../resources/service-sheet";
import { ServicesTable } from "../resources/services-table";
import { CreateSkillDialog, SkillSheet } from "../resources/skills";

import css from "../resources/resources.module.css";

const route = v4Path(
  "/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/$accessBundleId"
);
const listRoute = v4Path("/organizations/$orgId/projects/agent-vault/$projectId/access-bundles");
const sessionsRoute = v4Path("/organizations/$orgId/projects/agent-vault/$projectId/sessions");

type TSort = { columnId: string; direction: "asc" | "desc" };

const COMPARE: Record<string, (a: TAgentVaultService, b: TAgentVaultService) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  type: (a, b) => a.type.localeCompare(b.type),
  target: (a, b) => targetOf(a).localeCompare(targetOf(b)),
  createdAt: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
};

const ReadyAlert = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const navigate = useNavigate();
  const { data } = useV4Adapter("agentVault").useSessions(orgId, projectId, {
    scope: AgentVaultSessionScope.All,
    limit: 1
  });
  if (data?.totalCount !== 0) return null;
  return (
    <Alert
      tone="info"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: sessionsRoute, params: { orgId, projectId } })}
        >
          Go to sessions
        </Button>
      }
    >
      This bundle is ready. Create a session with it to give an agent access.
    </Alert>
  );
};

const BundleSkills = ({
  projectId,
  accessBundleId,
  canManage,
  canCreate,
  onOpen
}: {
  projectId: string;
  accessBundleId: string;
  canManage: boolean;
  canCreate: boolean;
  onOpen: (skillId: string) => void;
}) => {
  const resources = useV4Adapter("agentVaultResources");
  const { data: skills = [], isPending } = resources.useAccessBundleSkills(
    projectId,
    accessBundleId
  );
  const add = resources.useAddAccessBundleSkills(projectId);
  const remove = resources.useRemoveAccessBundleSkill(projectId);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);

  const rowActions: DataTableRowActions<TAgentVaultBundleSkill> = {
    inline: [
      {
        label: "View skill",
        icon: "eye",
        onSelect: (skill) => onOpen(skill.id)
      }
    ],
    renderMenu: canManage
      ? (skill) => (
          <DropdownMenuItem
            variant="destructive"
            onSelect={async () => {
              try {
                await remove.mutateAsync({
                  accessBundleId,
                  skillId: skill.id
                });
                saved(`Skill ${skill.name} removed`);
              } catch (error) {
                failed("Failed to remove skill", error);
              }
            }}
          >
            <Icon name="trash" />
            Remove from bundle
          </DropdownMenuItem>
        )
      : undefined
  };

  const columns: DataTableColumn<TAgentVaultBundleSkill>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      width: 240,
      render: (skill) => (
        <Button
          variant="link"
          underline="hover"
          title={skill.name}
          onClick={() => onOpen(skill.id)}
        >
          {skill.name}
        </Button>
      )
    },
    {
      id: "description",
      header: "Description",
      grow: true,
      render: (skill) => <span title={skill.description}>{skill.description}</span>
    }
  ];

  return (
    <Card
      variant="framed"
      title="Skills"
      flush={skills.length > 0 || isPending}
      action={
        canManage ? (
          <Button
            variant="outline"
            icon="plus"
            disabled={isPending}
            onClick={() => setAdding(true)}
          >
            Add skills
          </Button>
        ) : undefined
      }
    >
      {skills.length > 0 || isPending ? (
        <DataTable
          label="Skills in this bundle"
          rows={skills}
          columns={columns}
          loading={isPending}
          loadingRows={2}
          getRowId={(skill) => skill.id}
          rowLabel={(skill) => skill.name}
          rowActions={rowActions}
        />
      ) : (
        <EmptyState
          size="sm"
          media="bare"
          icon="file"
          title="No skills yet"
          description="Skills give agents running with this bundle instructions for their tasks."
        />
      )}
      {adding && (
        <AddBundleSkillsDialog
          projectId={projectId}
          accessBundleId={accessBundleId}
          bundleSkillIds={skills.map((skill) => skill.id)}
          onCreateNew={canCreate ? () => setCreating(true) : undefined}
          onOpenChange={setAdding}
        />
      )}
      {creating && (
        <CreateSkillDialog
          projectId={projectId}
          onOpenChange={setCreating}
          onCreated={async (skill) => {
            try {
              await add.mutateAsync({ accessBundleId, skillIds: [skill.id] });
              saved(`Skill ${skill.name} added to this access bundle`);
            } catch (error) {
              failed(`Skill ${skill.name} was created but not added`, error);
            }
          }}
        />
      )}
    </Card>
  );
};

const AccessBundleDetail = ({
  orgId,
  projectId,
  accessBundleId
}: {
  orgId: string;
  projectId: string;
  accessBundleId: string;
}) => {
  const resources = useV4Adapter("agentVaultResources");
  const navigate = useNavigate();
  const { isAdmin } = useIsAgentVaultAdmin(projectId);
  const { permission } = useProjectPermission(projectId);
  const canReadSkills = permission.can(
    ProjectPermissionAgentVaultSkillActions.Read,
    ProjectPermissionSub.AgentVaultSkills
  );
  const canCreateSkills = permission.can(
    ProjectPermissionAgentVaultSkillActions.Create,
    ProjectPermissionSub.AgentVaultSkills
  );
  const canEditSkills = permission.can(
    ProjectPermissionAgentVaultSkillActions.Edit,
    ProjectPermissionSub.AgentVaultSkills
  );
  const canDeleteSkills = permission.can(
    ProjectPermissionAgentVaultSkillActions.Delete,
    ProjectPermissionSub.AgentVaultSkills
  );
  const canEditBundle = permission.can(
    ProjectPermissionAgentVaultAccessBundleActions.Edit,
    ProjectPermissionSub.AgentVaultAccessBundles
  );
  const { id: skillId, openSheet, closeSheet } = useAgentVaultSheetState("skillId");
  const { data: accessBundle, isPending } = resources.useAccessBundle(projectId, accessBundleId);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<TSort>({
    columnId: "createdAt",
    direction: "desc"
  });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [managing, setManaging] = useState(false);
  const [addingService, setAddingService] = useState(false);
  const [sheet, setSheet] = useState<{ service?: TAgentVaultService }>();
  const [settingUp, setSettingUp] = useState<TAgentVaultService>();
  useAgentVaultCreateIntent(() => setSheet({}), isAdmin && Boolean(accessBundle));

  const back = () => navigate({ to: listRoute, params: { orgId, projectId } });
  const services = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = (accessBundle?.services ?? []).filter((service) =>
      [
        service.name,
        service.description ?? "",
        hostPatternOf(service) ?? "",
        targetOf(service),
        service.type,
        SERVICE_TYPE_LABELS[service.type]
      ].some((text) => text.toLowerCase().includes(term))
    );
    const ordered = [...filtered].sort(COMPARE[sort.columnId] ?? COMPARE.createdAt);
    return sort.direction === "asc" ? ordered : ordered.reverse();
  }, [accessBundle, search, sort]);

  if (isPending)
    return (
      <>
        <PageTitle title="Access Bundle" />
        <Loader size="page" label="Loading access bundle" />
      </>
    );
  if (!accessBundle)
    return (
      <>
        <PageTitle title="Access Bundle" />
        <EmptyState
          icon="folder"
          title="Access bundle not found"
          description="It was deleted or is no longer granted to you."
          actions={
            <Button variant="outline" onClick={back}>
              Back to access bundles
            </Button>
          }
        />
      </>
    );

  const needsSetup = accessBundle.services.filter(
    (service) => service.personalValues && !service.personalValues.isConfigured
  );
  const one = needsSetup.length === 1;

  return (
    <TooltipProvider>
      <PageTitle title={accessBundle.name || "Access Bundle"} />
      <div className={css.detailPage}>
        <Stack gap={24}>
          <Stack gap={8}>
            <BackButton label="Access bundles" onClick={back} />
            <PageHeader
              title={accessBundle.name}
              description={accessBundle.description || undefined}
              badges={
                <DocumentationLink href={AgentVaultDocs.accessBundles} subject="access bundles" />
              }
              actions={
                isAdmin ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" iconRight="more">
                        Options
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setManaging(true)}>
                        <Icon name="users" />
                        Manage access
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setEditing(true)}>
                        <Icon icon={PencilIcon} />
                        Edit access bundle
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                        <Icon name="trash" />
                        Delete access bundle
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : undefined
              }
            />
          </Stack>
          {needsSetup.length > 0 && (
            <Alert
              tone="warn"
              actions={
                <Button variant="outline" size="sm" onClick={() => setSettingUp(needsSetup[0])}>
                  {`Set up ${needsSetup[0].name}`}
                </Button>
              }
            >
              {`${one ? `${needsSetup[0].name} requires` : `${needsSetup.length} services require`} your personal values. Sessions from this bundle can't reach ${one ? "it" : "them"} until you set ${one ? "it" : "them"} up.`}
            </Alert>
          )}
          {isAdmin && accessBundle.services.length > 0 && (
            <ReadyAlert orgId={orgId} projectId={projectId} />
          )}
          <Card
            variant="framed"
            title="Services"
            flush={accessBundle.services.length > 0}
            action={
              <Inline gap={8} wrap={false}>
                {accessBundle.services.length > 0 && (
                  <HeaderSearch
                    label="Search services"
                    placeholder="Search services"
                    value={search}
                    onValueChange={setSearch}
                  />
                )}
                {isAdmin && (
                  <Button variant="outline" icon="plus" onClick={() => setAddingService(true)}>
                    Add services
                  </Button>
                )}
              </Inline>
            }
          >
            {accessBundle.services.length > 0 ? (
              <ServicesTable
                orgId={orgId}
                projectId={projectId}
                accessBundleId={accessBundle.id}
                services={services}
                canManage={isAdmin}
                loading={false}
                sort={sort}
                onSortChange={setSort}
                empty={
                  <EmptyState
                    size="sm"
                    media="bare"
                    icon="search"
                    title="No services match your search"
                  />
                }
                onEdit={(service) => setSheet({ service })}
                onSetUp={setSettingUp}
              />
            ) : (
              <EmptyState
                size="sm"
                media="bare"
                icon="globe"
                title="No services yet"
                description="Add services to give this bundle access to external hosts."
              />
            )}
          </Card>
          {canReadSkills && (
            <BundleSkills
              projectId={projectId}
              accessBundleId={accessBundle.id}
              canManage={canEditBundle}
              canCreate={canCreateSkills}
              onOpen={openSheet}
            />
          )}
        </Stack>
      </div>
      {addingService && (
        <AddBundleServicesDialog
          projectId={projectId}
          accessBundleId={accessBundle.id}
          bundleServiceIds={accessBundle.services.map((service) => service.id)}
          onCreateNew={() => setSheet({})}
          onOpenChange={setAddingService}
        />
      )}
      {isAdmin && sheet && (
        <ServiceSheet
          key={sheet.service?.id ?? "new"}
          projectId={projectId}
          accessBundleId={accessBundle.id}
          service={sheet.service}
          onOpenChange={(open) => !open && setSheet(undefined)}
        />
      )}
      <PersonalValuesDialog
        projectId={projectId}
        service={settingUp && (services.find(({ id }) => id === settingUp.id) ?? settingUp)}
        onOpenChange={(open) => !open && setSettingUp(undefined)}
      />
      <ManageAccessSheet
        projectId={projectId}
        accessBundle={managing ? accessBundle : undefined}
        onOpenChange={setManaging}
      />
      {editing && (
        <AccessBundleDialog
          projectId={projectId}
          accessBundle={accessBundle}
          onOpenChange={setEditing}
        />
      )}
      <DeleteAccessBundleDialog
        projectId={projectId}
        accessBundle={deleting ? accessBundle : undefined}
        onOpenChange={setDeleting}
        onDeleted={back}
      />
      {canReadSkills && (
        <SkillSheet
          projectId={projectId}
          skillId={skillId}
          canEdit={canEditSkills}
          canDelete={canDeleteSkills}
          onOpenChange={(open) => !open && closeSheet()}
        />
      )}
    </TooltipProvider>
  );
};

export const AgentVaultAccessBundleDetailPage = () => {
  const { orgId, projectId, accessBundleId } = useParams({ from: route });
  return (
    <AccessBundleDetail
      key={accessBundleId}
      orgId={orgId}
      projectId={projectId}
      accessBundleId={accessBundleId}
    />
  );
};
