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
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { Text } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  type CertRequestPolicyConditions,
  type TApprovalPolicy
} from "@app/hooks/api/approvalPolicies/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { requestedAgo } from "../components/approval";
import { PolicySheet } from "./policy-sheet";

const profileNamesOf = (policy: TApprovalPolicy) =>
  (policy.conditions.conditions as CertRequestPolicyConditions).flatMap(
    (condition) => condition.profileNames
  );

const MAX_PROFILE_BADGES = 3;

export const PolicyProfileBadges = ({
  policy,
  mono
}: {
  policy: TApprovalPolicy;
  mono?: boolean;
}) => {
  const names = profileNamesOf(policy);
  const overflow = names.slice(MAX_PROFILE_BADGES);
  return (
    <Inline gap={4} align="center" wrap={false} style={{ minWidth: 0 }}>
      {names.slice(0, MAX_PROFILE_BADGES).map((name) => (
        <Badge
          key={name}
          size="sm"
          tone="outline"
          mono={mono}
          title={name}
          style={{ minWidth: 0, flexShrink: 1 }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
        </Badge>
      ))}
      {overflow.length > 0 && (
        <Tooltip content={overflow.join(", ")}>
          <Badge size="sm" tone="soft" style={{ flexShrink: 0 }}>{`+${overflow.length}`}</Badge>
        </Tooltip>
      )}
    </Inline>
  );
};

export const PoliciesTab = ({ projectId }: { projectId: string }) => {
  const approvals = useV4Adapter("approvalRequests");
  const { data: viewer, isPending: viewerPending } = approvals.useViewer(projectId);
  const isAdmin = Boolean(viewer?.isAdmin);
  const { data: policies = [], isPending } = approvals.usePolicies(
    {
      policyType: ApprovalPolicyType.CertRequest,
      scope: ApprovalPolicyScope.Project,
      scopeId: projectId
    },
    { enabled: isAdmin }
  );
  const remove = approvals.useDeletePolicy();
  const [editing, setEditing] = useState<TApprovalPolicy>();
  const [deleting, setDeleting] = useState<TApprovalPolicy>();
  if (viewerPending) return <Loader label="Loading approval policies" />;
  if (!isAdmin)
    return (
      <EmptyState
        icon="lock"
        title="Access restricted"
        description="Only Certificate Manager admins can view and manage certificate approval policies."
      />
    );
  const rows = [...policies].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const columns: DataTableColumn<TApprovalPolicy>[] = [
    {
      id: "name",
      header: "Policy name",
      primary: true,
      grow: true,
      text: (policy) => policy.name,
      render: (policy) => (
        <Inline gap={8} align="center" wrap={false}>
          <Button variant="link" underline="hover" onClick={() => setEditing(policy)}>
            {policy.name}
          </Button>
          {policy.scopeType !== ApprovalPolicyScope.PkiApplication && (
            <Badge size="sm" tone="soft">
              Legacy
            </Badge>
          )}
        </Inline>
      )
    },
    {
      id: "profiles",
      header: "Profiles",
      width: 360,
      render: (policy) => <PolicyProfileBadges policy={policy} />
    },
    {
      id: "steps",
      header: "Approval steps",
      width: 136,
      render: (policy) => `${policy.steps.length} step${policy.steps.length === 1 ? "" : "s"}`
    },
    {
      id: "created",
      header: "Created",
      width: 144,
      render: (policy) => requestedAgo(policy.createdAt)
    }
  ];
  return (
    <Stack gap={16}>
      <Text muted>
        Existing policies created outside an application remain editable. Create new approval
        policies inside an application.
      </Text>
      <DataTable
        label="Certificate approval policies"
        rows={rows}
        loading={isPending}
        columns={columns}
        getRowId={(policy) => policy.id}
        rowLabel={(policy) => policy.name}
        onRowActivate={setEditing}
        rowActions={{
          renderMenu: (policy) => (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  navigator.clipboard?.writeText(policy.id).catch(() => undefined);
                  saved("Approval policy ID copied");
                }}
              >
                <Icon name="copy" />
                Copy ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(policy)}>
                <Icon name="trash" />
                Delete policy
              </DropdownMenuItem>
            </>
          )
        }}
        empty={
          <EmptyState size="sm" icon="check-c" title="No certificate approval policies found" />
        }
      />
      <PolicySheet projectId={projectId} policy={editing} onClose={() => setEditing(undefined)} />
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="delete">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete ${deleting?.name ?? "policy"}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Certificates from its profiles no longer need this approval. You cannot undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync({
                    policyType: ApprovalPolicyType.CertRequest,
                    policyId: deleting.id
                  });
                } catch (error) {
                  failed("Failed to delete policy", error);
                  return;
                }
                saved("Policy deleted");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
