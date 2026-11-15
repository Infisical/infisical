import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Meta } from "@infisical/cipher/ui/text";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import type { TAgentVaultSkill } from "@app/hooks/api/agentVault/types";
import { useAgentVaultCreateIntent } from "@app/hooks/useAgentVaultCreateIntent";
import { useAgentVaultSheetState } from "@app/hooks/useAgentVaultSheetState";
import { useDebounce } from "@app/hooks/useDebounce";
import { useResetPageHelper } from "@app/hooks/useResetPageHelper";

import { useProjectPermission } from "../../access/permissions";
import { AccessRestricted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { AgentVaultDocs, useIsAgentVaultAdmin } from "../resources/agent-vault-utils";
import { DateCell } from "../resources/shared";
import { CreateSkillDialog, DeleteSkillDialog, SkillSheet } from "../resources/skills";

const route = v4Path("/organizations/$orgId/projects/agent-vault/$projectId/skills");
const TABLE = "agentVaultSkillsTable";
const BUNDLES_SHOWN = 2;

const Bundles = ({ bundles }: { bundles: TAgentVaultSkill["accessBundles"] }) => {
  if (!bundles.length) return <Meta>-</Meta>;
  const hidden = bundles.slice(BUNDLES_SHOWN);
  return (
    <Inline gap={4} align="center" wrap={false}>
      {bundles.slice(0, BUNDLES_SHOWN).map((bundle) => (
        <Badge key={bundle.id} tone="outline">
          {bundle.name}
        </Badge>
      ))}
      {hidden.length > 0 && (
        <Tooltip content={hidden.map((bundle) => bundle.name).join(", ")}>
          <Meta tabIndex={0}>+{hidden.length}</Meta>
        </Tooltip>
      )}
    </Inline>
  );
};

const Skills = ({ projectId }: { projectId: string }) => {
  const resources = useV4Adapter("agentVaultResources");
  const { permission } = useProjectPermission(projectId);
  const can = (action: ProjectPermissionAgentVaultSkillActions) =>
    permission.can(action, ProjectPermissionSub.AgentVaultSkills);
  const canCreate = can(ProjectPermissionAgentVaultSkillActions.Create);
  const canEdit = can(ProjectPermissionAgentVaultSkillActions.Edit);
  const canDelete = can(ProjectPermissionAgentVaultSkillActions.Delete);
  const { id: skillId, openSheet, closeSheet } = useAgentVaultSheetState("skillId");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(TABLE, PreferenceKey.PerPage, 20)
  );
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TAgentVaultSkill>();
  useAgentVaultCreateIntent(() => setCreating(true), canCreate);
  const searchTerm = debouncedSearch.trim();

  const { data, isPending } = resources.useSkills(projectId, {
    search: searchTerm || undefined,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const skills = data?.skills ?? [];
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });

  const columns: DataTableColumn<TAgentVaultSkill>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      width: 240,
      text: (skill) => skill.name,
      render: (skill) => (
        <Button
          variant="link"
          underline="hover"
          title={skill.name}
          onClick={() => openSheet(skill.id)}
        >
          {skill.name}
        </Button>
      )
    },
    {
      id: "description",
      header: "Description",
      grow: true,
      minWidth: 240,
      render: (skill) => <span title={skill.description}>{skill.description}</span>
    },
    {
      id: "accessBundles",
      header: "Access bundles",
      width: 224,
      render: (skill) => <Bundles bundles={skill.accessBundles} />
    },
    {
      id: "version",
      header: "Version",
      width: 88,
      render: (skill) => <Meta>v{skill.latestVersion}</Meta>
    },
    {
      id: "updated",
      header: "Updated",
      width: 128,
      render: (skill) => <DateCell value={skill.updatedAt} />
    }
  ];

  const rowActions: DataTableRowActions<TAgentVaultSkill> = {
    menuLabel: "Skill options",
    inline: [
      {
        label: "View skill",
        icon: "eye",
        onSelect: (skill) => openSheet(skill.id)
      }
    ],
    renderMenu: canDelete
      ? (skill) => (
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(skill)}>
            <Icon name="trash" />
            Delete skill
          </DropdownMenuItem>
        )
      : undefined
  };

  return (
    <>
      <Stack gap={24}>
        <PageHeader
          title="Skills"
          badges={<DocumentationLink href={AgentVaultDocs.skills} subject="skills" />}
          actions={
            canCreate ? (
              <Button variant="accent" icon="plus" onClick={() => setCreating(true)}>
                Create skill
              </Button>
            ) : undefined
          }
        />
        <Input
          icon="search"
          aria-label="Search skills"
          placeholder="Search skills..."
          slashShortcut
          maxLength={255}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <DataTable
          label="Skills"
          rows={skills}
          columns={columns}
          loading={isPending}
          getRowId={(skill) => skill.id}
          rowLabel={(skill) => skill.name}
          rowActions={rowActions}
          // v4-check-ignore row-activate-navigates -- opens the skill sheet in place; the search param only keeps it addressable
          onRowActivate={(skill) => openSheet(skill.id)}
          focusedRowId={skillId}
          empty={
            searchTerm ? (
              <EmptyState
                size="sm"
                media="bare"
                icon="search"
                title="No skills match your search"
                actions={
                  <Button variant="outline" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <EmptyState
                size="sm"
                media="bare"
                icon="file"
                title="No skills yet"
                description="A skill holds instructions agents follow, delivered through access bundles."
                actions={
                  canCreate ? (
                    <Button variant="outline" icon="plus" onClick={() => setCreating(true)}>
                      Create skill
                    </Button>
                  ) : undefined
                }
              />
            )
          }
          pagination={
            totalCount > 0 ? (
              <Pagination
                label="Skill pages"
                variant="compact"
                page={page}
                onPageChange={setPage}
                total={totalCount}
                pageSize={perPage}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageSizeChange={(next) => {
                  setPerPage(next);
                  setPage(1);
                  setUserTablePreference(TABLE, PreferenceKey.PerPage, next);
                }}
              />
            ) : undefined
          }
        />
      </Stack>
      {creating && (
        <CreateSkillDialog
          projectId={projectId}
          onOpenChange={setCreating}
          onCreated={(skill) => openSheet(skill.id)}
        />
      )}
      <DeleteSkillDialog
        projectId={projectId}
        skill={deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      />
      <SkillSheet
        projectId={projectId}
        skillId={skillId}
        canEdit={canEdit}
        canDelete={canDelete}
        onOpenChange={(open) => !open && closeSheet()}
      />
    </>
  );
};

export const AgentVaultSkillsPage = () => {
  const { projectId } = useParams({ from: route });
  const { isAdmin, isPending } = useIsAgentVaultAdmin(projectId);
  return (
    <TooltipProvider>
      <PageTitle title="Skills" />
      {isPending || isAdmin ? (
        <Skills key={projectId} projectId={projectId} />
      ) : (
        <AccessRestricted />
      )}
    </TooltipProvider>
  );
};
