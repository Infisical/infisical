import { useEffect, useMemo, useState } from "react";
import { PencilIcon } from "lucide-react";

import { SecretApprovalPoliciesUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import { FilterBar, type FilterBarFilter } from "@app/components/v4/patterns/filter-bar";
import { Alert } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v4/ui/popover";
import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { getMemberLabel } from "@app/helpers/members";
import type { TAccessApprovalPolicy } from "@app/hooks/api/accessApproval/types";
import { PolicyType } from "@app/hooks/api/policies/enums";
import type { Project } from "@app/hooks/api/projects/types";
import type { TWorkspaceUser } from "@app/hooks/api/users/types";

import { useOrgId, useProjectPermission } from "../../../access/permissions";
import { usePagedList } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { useUpgradeGate } from "../../../license";
import { PolicySheet, type PolicyRecord } from "./policy-sheet";
import { groupApproversBySequence, POLICY_TYPE_LABELS } from "./policy.utils";
import { RemovePolicyDialog } from "./remove-policy-dialog";

import styles from "./policies.module.css";

const RESTRICTED = "Your role doesn't allow this";
const PAYWALL = {
  intent: SecretApprovalPoliciesUpgradeIntent,
  paywallKey: "secret-manager.approval-policy-list"
};

const firstEnvironmentName = (policy: PolicyRecord) =>
  policy.environments.map((env) => env.name.toLowerCase()).sort()[0] ?? "";

const ApproversSummary = ({
  policy,
  members,
  groups,
  delegatedName
}: {
  policy: PolicyRecord;
  members: TWorkspaceUser[];
  groups: { group: { id: string; name: string } }[];
  delegatedName: string;
}) => {
  const steps = groupApproversBySequence(policy.approvers, policy.approvals);
  const total = steps.reduce((count, step) => count + step.user.length + step.group.length, 0);
  let label = "No approvers";
  if (policy.delegatedApproval) label = delegatedName;
  else if (steps.length > 1) label = `${steps.length} steps`;
  else if (total) label = `${total} approver${total === 1 ? "" : "s"}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="link"
          underline="hover"
          aria-label={`Approvers for ${policy.name || "unnamed policy"}`}
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" style={{ width: 288 }}>
        {policy.delegatedApproval && (
          <span className={styles.secondary}>Requests are approved in {delegatedName}.</span>
        )}
        {!policy.delegatedApproval && !steps.length && (
          <span className={styles.secondary}>No approvers configured.</span>
        )}
        {!policy.delegatedApproval && steps.length > 0 && (
          <Stack gap={12}>
            {steps.map((step) => {
              const groupNames = step.group.map(
                (entry) => groups.find(({ group }) => group.id === entry.id)?.group.name ?? entry.id
              );
              return (
                <Stack key={step.sequence} gap={6}>
                  <span className={styles.groupLabel}>
                    {steps.length > 1 && `Step ${step.sequence}: `}
                    {step.approvals} {step.approvals === 1 ? "approval" : "approvals"} required
                  </span>
                  <dl className={styles.approverList}>
                    <dt>Users</dt>
                    <dd>
                      {step.user.length ? (
                        <ul className={styles.names}>
                          {step.user.map((approver) => {
                            const member = members.find((entry) => entry.user.id === approver.id);
                            const inactive = member && member.user.isOrgMembershipActive === false;
                            return (
                              <li key={approver.id} data-muted={!member || inactive || undefined}>
                                {member ? getMemberLabel(member) : approver.name || approver.id}
                                {!member && <Badge tone="outline">Removed</Badge>}
                                {inactive && <Badge tone="outline">Inactive</Badge>}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <span className={styles.secondary}>None</span>
                      )}
                    </dd>
                    <dt>Groups</dt>
                    <dd>
                      {groupNames.length ? (
                        groupNames.join(", ")
                      ) : (
                        <span className={styles.secondary}>None</span>
                      )}
                    </dd>
                  </dl>
                </Stack>
              );
            })}
          </Stack>
        )}
      </PopoverContent>
    </Popover>
  );
};

export const ApprovalPolicies = ({
  project,
  openAddPolicy,
  onAddPolicyOpened
}: {
  project: Project;
  openAddPolicy?: PolicyType | null;
  onAddPolicyOpened?: () => void;
}) => {
  const orgId = useOrgId();
  const adapter = useV4Adapter("approvalPolicies");
  const { permission } = useProjectPermission(project.id);
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const { data: gates } = adapter.useGates(orgId);
  const canRead = permission.can(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.SecretApproval
  );
  const canCreate = permission.can(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.SecretApproval
  );
  const canEdit = permission.can(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.SecretApproval
  );
  const canDelete = permission.can(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.SecretApproval
  );
  const canReadMembers = permission.can(
    ProjectPermissionMemberActions.Read,
    ProjectPermissionSub.Member
  );
  const canReadGroups = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Groups);

  const accessPolicies = adapter.useAccessPolicies(project.slug, {
    enabled: canRead && Boolean(project.slug)
  });
  const changePolicies = adapter.useChangePolicies(project.id, { enabled: canRead });
  const approverOptions = adapter.useApproverOptions(project.id, {
    members: canReadMembers,
    groups: canReadGroups
  });
  const hasDelegated = (accessPolicies.data ?? []).some((policy) => policy.delegatedApproval);
  const { data: delegatedOptions = [] } = adapter.useDelegatedApprovalOptions({
    enabled: hasDelegated
  });

  const policies = useMemo<PolicyRecord[]>(
    () =>
      [
        ...(accessPolicies.data ?? []).map((policy) => ({
          ...policy,
          policyType: PolicyType.AccessPolicy
        })),
        ...(changePolicies.data ?? []).map(
          (policy) =>
            ({ ...policy, policyType: PolicyType.ChangePolicy }) as unknown as TAccessApprovalPolicy
        )
      ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [accessPolicies.data, changePolicies.data]
  );
  const isLoading = canRead && (accessPolicies.isPending || changePolicies.isPending);
  const isError = Boolean(accessPolicies.error || changePolicies.error);
  const isRetrying = accessPolicies.isFetching || changePolicies.isFetching;
  const retryPolicies = (
    <Button
      variant="outline"
      size="xs"
      icon="sync"
      loading={isRetrying}
      onClick={() => {
        accessPolicies.refetch();
        changePolicies.refetch();
      }}
    >
      Retry
    </Button>
  );

  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const typeFilter = filters.find((filter) => filter.field === "type")?.values[0];
  const environmentFilter = filters.find((filter) => filter.field === "environment")?.values ?? [];
  const filtered = useMemo(
    () =>
      policies.filter(
        (policy) =>
          (!typeFilter || policy.policyType === typeFilter) &&
          (!environmentFilter.length ||
            policy.environments.some((env) => environmentFilter.includes(env.id)))
      ),
    [policies, typeFilter, environmentFilter]
  );
  const list = usePagedList({
    rows: filtered,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (policy, needle) =>
      policy.name.toLowerCase().includes(needle) ||
      policy.environments.some((env) => env.name.toLowerCase().includes(needle)) ||
      (policy.secretPath ?? "*").toLowerCase().includes(needle),
    compare: (a, b, columnId) => {
      if (columnId === "type") return a.policyType.localeCompare(b.policyType);
      if (columnId === "environment")
        return firstEnvironmentName(a).localeCompare(firstEnvironmentName(b));
      if (columnId === "path")
        return (a.secretPath ?? "*")
          .toLowerCase()
          .localeCompare((b.secretPath ?? "*").toLowerCase());
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    }
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PolicyRecord>();
  const [removing, setRemoving] = useState<PolicyRecord>();

  const [createType, setCreateType] = useState(PolicyType.ChangePolicy);
  const openCreate = (policyType = PolicyType.ChangePolicy) => {
    if (gates && !gates.secretApproval) {
      openUpgradeGate(PAYWALL);
      return;
    }
    setCreateType(policyType);
    setEditing(undefined);
    setSheetOpen(true);
  };
  useEffect(() => {
    if (!openAddPolicy || !gates) return;
    onAddPolicyOpened?.();
    if (canCreate) openCreate(openAddPolicy);
  }, [openAddPolicy, gates]);
  const openEdit = (policy: PolicyRecord) => {
    setEditing(policy);
    setSheetOpen(true);
  };
  const delegatedName = (policy: PolicyRecord) =>
    delegatedOptions.find((option) => option.type === policy.delegatedApproval?.type)?.name ??
    "the external approval system";

  const columns: DataTableColumn<PolicyRecord>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      sortable: true,
      text: (policy) => policy.name || "Unnamed policy",
      render: (policy) => (
        <Button
          variant="link"
          underline="hover"
          disabledReason={canEdit ? undefined : RESTRICTED}
          onClick={() => openEdit(policy)}
        >
          {policy.name || "Unnamed policy"}
        </Button>
      )
    },
    {
      id: "environment",
      header: "Environments",
      width: 200,
      sortable: true,
      text: (policy) => policy.environments.map((env) => env.name).join(", "),
      render: (policy) => policy.environments.map((env) => env.name).join(", ")
    },
    {
      id: "path",
      header: "Secret path",
      width: 160,
      mono: true,
      sortable: true,
      text: (policy) => policy.secretPath || "*",
      render: (policy) => policy.secretPath || "*"
    },
    {
      id: "type",
      header: "Type",
      width: 140,
      sortable: true,
      render: (policy) => (
        <Badge tone={policy.policyType === PolicyType.AccessPolicy ? "info" : "soft"}>
          {POLICY_TYPE_LABELS[policy.policyType]}
        </Badge>
      )
    },
    {
      id: "approvers",
      header: "Approvers",
      width: 160,
      render: (policy) => (
        <ApproversSummary
          policy={policy}
          members={approverOptions.members}
          groups={approverOptions.groups}
          delegatedName={delegatedName(policy)}
        />
      )
    }
  ];

  const searching = Boolean(list.search.trim() || typeFilter || environmentFilter.length);
  const addPolicy = (
    <Button
      variant="accent"
      icon="plus"
      disabledReason={canCreate ? undefined : RESTRICTED}
      onClick={() => openCreate()}
    >
      Add policy
    </Button>
  );

  if (!canRead)
    return (
      <EmptyState
        icon="lock"
        title="You don't have access to approval policies"
        description="Ask a project admin for read access to secret approvals."
      />
    );

  return (
    <Stack gap={16}>
      <FilterBar
        label="Policy filters"
        fields={[
          {
            key: "environment",
            label: "Environment",
            type: "multi-select",
            searchable: true,
            options: project.environments.map((env) => ({ value: env.id, label: env.name }))
          },
          {
            key: "type",
            label: "Policy type",
            type: "select",
            options: Object.values(PolicyType).map((type) => ({
              value: type,
              label: POLICY_TYPE_LABELS[type]
            }))
          }
        ]}
        value={filters}
        onChange={(next) => {
          setFilters(next);
          list.resetPage();
        }}
        search={
          <Input
            icon="search"
            aria-label="Search approval policies"
            placeholder="Search by name, environment or secret path"
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
          />
        }
        actions={addPolicy}
      />
      {isError && policies.length > 0 && (
        <Alert tone="bad" title="Couldn't load all approval policies" actions={retryPolicies} />
      )}
      {approverOptions.isError && (
        <Alert
          tone="bad"
          title="Couldn't load all approver suggestions"
          actions={
            <Button
              variant="outline"
              size="xs"
              icon="sync"
              loading={approverOptions.isFetching}
              onClick={approverOptions.refetch}
            >
              Retry
            </Button>
          }
        >
          You can still enter exact project member emails.
        </Alert>
      )}
      <DataTable
        label="Approval policies"
        rows={list.pageRows}
        columns={columns}
        loading={isLoading}
        loadingRows={5}
        getRowId={(policy) => policy.id}
        rowLabel={(policy) => policy.name || "Unnamed policy"}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowActivate={canEdit ? openEdit : undefined}
        rowActions={{
          inline: [
            {
              label: "Edit policy",
              icon: PencilIcon,
              onSelect: openEdit,
              disabledReason: () => (canEdit ? undefined : RESTRICTED)
            }
          ],
          renderMenu: (policy) => (
            <DropdownMenuItem
              variant="destructive"
              disabled={!canDelete}
              description={canDelete ? undefined : RESTRICTED}
              onSelect={() => setRemoving(policy)}
            >
              <Icon name="trash" />
              Remove policy
            </DropdownMenuItem>
          )
        }}
        empty={
          (isError && !policies.length && (
            <EmptyState
              size="sm"
              icon="alert"
              title="Couldn't load approval policies"
              actions={retryPolicies}
            />
          )) ||
          (searching && policies.length ? (
            <EmptyState
              size="sm"
              icon="search"
              title="No policies match search"
              description="Try adjusting your search or filters."
            />
          ) : (
            <EmptyState
              size="sm"
              title="No policies yet"
              description="Require approval for secret changes and access requests."
              actions={
                <Button
                  icon="plus"
                  disabledReason={canCreate ? undefined : RESTRICTED}
                  onClick={() => openCreate()}
                >
                  Add policy
                </Button>
              }
            />
          ))
        }
        pagination={isLoading ? undefined : list.pagination}
      />
      <PolicySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        policy={editing}
        initialPolicyType={createType}
        project={project}
        approverOptions={approverOptions}
        enterpriseAppConnections={Boolean(gates?.enterpriseAppConnections)}
      />
      <RemovePolicyDialog
        policy={removing}
        project={project}
        onClose={() => setRemoving(undefined)}
      />
      {upgradeGate}
    </Stack>
  );
};
