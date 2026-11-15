import { type Dispatch, type ReactNode, type SetStateAction, useRef, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge, Count } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Item } from "@infisical/cipher/ui/item";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Select } from "@infisical/cipher/ui/select";
import { SheetBody, SheetFooter } from "@infisical/cipher/ui/sheet";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { SmallText, StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import {
  PamAccessRequestStatus,
  PamAccessType,
  PamApproverType,
  PamNotificationEvent,
  type TPamAccessRequest,
  type TPamNotificationConfig
} from "@app/hooks/api/pam";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { errorMessage, failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { isGrantActive, requesterSubtitle, requestStatus } from "../PamApprovalRequestsPage/status";
import { AutoApprovalCard } from "./auto-approval";
import {
  folderAutoApprovalScope,
  isRuleComplete,
  serializeAutoApprovalDraft,
  type TAutoApprovalDraft,
  toAutoApprovalConfig,
  toAutoApprovalDraft
} from "./auto-approval-draft";
import { ConfirmAction } from "./confirm-action";
import { FolderAlerts } from "./folder-alerts";
import { usePamDirectory } from "./members";

type Approver = { type: PamApproverType; id: string };
type ApproverRow = Approver & { name: string; subtitle?: string };

const TABLE_PREFERENCE = "pamFolderAccessRequestsTable";
const approverKey = ({ type, id }: Approver) => `${type}:${id}`;

const EVENT_LABELS: Record<PamNotificationEvent, string> = {
  [PamNotificationEvent.AccessRequested]: "Access requested",
  [PamNotificationEvent.AccessRequestApproved]: "Request approved",
  [PamNotificationEvent.AccessRequestDenied]: "Request denied",
  [PamNotificationEvent.AccessRequestBypassed]: "Break-glass used"
};

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: PamAccessRequestStatus.Pending, label: "Pending review" },
  { value: PamAccessRequestStatus.Approved, label: "Approved" },
  { value: PamAccessRequestStatus.Rejected, label: "Rejected" }
];

const ApproverCard = ({
  title,
  label,
  rows,
  options,
  empty,
  onAdd,
  onRemove
}: {
  title: string;
  label: string;
  rows: ApproverRow[];
  options: { value: string; label: string; meta?: string }[];
  empty: ReactNode;
  onAdd: (approver: Approver) => void;
  onRemove: (approver: Approver) => void;
}) => {
  const columns: DataTableColumn<ApproverRow>[] = [
    {
      id: "name",
      header: "Approver",
      primary: true,
      grow: true,
      text: (row) => row.name,
      secondary: (row) => row.subtitle,
      render: (row) => row.name
    },
    {
      id: "type",
      header: "Type",
      width: 112,
      render: (row) => (
        <Badge tone="outline">{row.type === PamApproverType.User ? "User" : "Group"}</Badge>
      )
    },
    {
      id: "remove",
      header: "",
      width: 56,
      render: (row) => (
        <Button
          variant="ghost"
          size="icon-xs"
          icon="trash"
          iconOnly
          aria-label={`Remove ${row.name}`}
          onClick={() => onRemove(row)}
        />
      )
    }
  ];
  return (
    <Card
      variant="framed"
      flush
      title={title}
      badges={<Count tone="neutral">{rows.length}</Count>}
      action={
        <Combobox
          label={`Add ${label}`}
          width="sm"
          placeholder="Add user or group"
          emptyText="No folder members left. Add them under Permissions first."
          options={options}
          value=""
          onChange={(value) => {
            const [type, id] = value.split(":");
            if (type && id) onAdd({ type: type as PamApproverType, id });
          }}
        />
      }
    >
      <DataTable
        label={title}
        rows={rows}
        columns={columns}
        getRowId={approverKey}
        rowLabel={(row) => row.name}
        empty={empty}
      />
    </Card>
  );
};

const LegacyNotifications = ({
  configs,
  slugById,
  onChange
}: {
  configs: TPamNotificationConfig[];
  slugById: Record<string, string>;
  onChange: (configs: TPamNotificationConfig[]) => void;
}) => (
  <Card
    variant="framed"
    title="Slack notifications"
    badges={
      <Inline gap={4}>
        <Badge tone="soft">Legacy</Badge>
        <Count tone="neutral">{configs.length}</Count>
      </Inline>
    }
    hint="These keep posting, but can no longer be added or edited."
  >
    <Stack gap={8}>
      {configs.length === 0 ? (
        <EmptyState
          size="sm"
          media="bare"
          icon="bell"
          title="All Slack notifications removed"
          description="Save changes to apply."
        />
      ) : (
        configs.map((config, index) => (
          <Item
            key={config.workflowIntegrationId}
            variant="outline"
            size="sm"
            icon="megaphone"
            title={slugById[config.workflowIntegrationId] ?? "Slack workspace"}
            actions={
              <Button
                variant="ghost"
                size="icon-xs"
                icon="trash"
                iconOnly
                aria-label="Remove Slack notification"
                onClick={() => onChange(configs.filter((_, position) => position !== index))}
              />
            }
          >
            <SmallText muted>{`${
              config.channels.map(({ name }) => `#${name}`).join(", ") || "No channels"
            }. Notifies on ${config.events
              .map((event) => EVENT_LABELS[event] ?? event)
              .join(", ")
              .toLowerCase()}.`}</SmallText>
          </Item>
        ))
      )}
    </Stack>
  </Card>
);

const FolderRequests = ({ folderId, canRevoke }: { folderId: string; canRevoke: boolean }) => {
  const pam = useV4Adapter("pam");
  const pamAccess = useV4Adapter("pamAccess");
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const revoke = pam.useRevokeAccessRequest();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(TABLE_PREFERENCE, PreferenceKey.PerPage, 10)
  );
  const [status, setStatus] = useState("all");
  const [revoking, setRevoking] = useState<TPamAccessRequest | null>(null);
  const { data, isPending } = pamAccess.useFolderAccessRequests({
    folderId,
    status: status === "all" ? undefined : status,
    offset: (page - 1) * perPage,
    limit: perPage
  });
  const requests = data?.requests ?? [];
  const total = data?.totalCount ?? 0;
  const typeMap = new Map(accountTypes.map((meta) => [meta.type, meta]));

  const columns: DataTableColumn<TPamAccessRequest>[] = [
    {
      id: "requester",
      header: "Requester",
      primary: true,
      grow: true,
      text: (request) => request.requesterName,
      secondary: (request) => requesterSubtitle(request) || undefined,
      render: (request) => request.requesterName
    },
    {
      id: "account",
      header: "Account",
      width: 176,
      text: (request) => request.accountName ?? "",
      render: (request) => {
        const meta = request.accountType ? typeMap.get(request.accountType) : undefined;
        return (
          <Inline gap={8} align="center" wrap={false}>
            {meta && <ProviderIcon icon={meta.icon} alt={meta.name} size="sm" />}
            <MiddleTruncate text={request.accountName ?? "Unknown account"} />
          </Inline>
        );
      }
    },
    {
      id: "requesting",
      header: "Requesting",
      width: 112,
      render: (request) =>
        request.accessType === PamAccessType.Credential ? (
          <Badge tone="warn">Credentials</Badge>
        ) : (
          <Badge tone="soft">Session</Badge>
        )
    },
    {
      id: "status",
      header: "Status",
      grow: true,
      render: (request) => {
        const info = requestStatus(request);
        const rule = request.autoApproval?.rules.find(
          ({ id }) => id === request.autoApproval?.approvedByRuleId
        );
        const label = (
          <StatusText tone={info.tone} icon={info.icon} tabIndex={request.autoApprovedAt ? 0 : -1}>
            {info.label}
          </StatusText>
        );
        return (
          <Stack gap={4}>
            {request.autoApprovedAt ? (
              <Tooltip content={`Approved by the rule "${rule?.name ?? "auto-approval"}"`}>
                {label}
              </Tooltip>
            ) : (
              label
            )}
            {request.isBreakGlass && (
              <Tooltip
                content={request.bypassReason ? `Reason: "${request.bypassReason}"` : undefined}
              >
                <Badge tone="bad" icon="shield" tabIndex={0}>
                  Break-glass
                </Badge>
              </Tooltip>
            )}
          </Stack>
        );
      }
    },
    ...(canRevoke
      ? [
          {
            id: "revoke",
            header: "",
            width: 56,
            render: (request: TPamAccessRequest) =>
              isGrantActive(request) && request.grantId ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  icon="lock"
                  iconOnly
                  aria-label="Revoke access"
                  onClick={() => setRevoking(request)}
                />
              ) : null
          }
        ]
      : [])
  ];

  return (
    <>
      <Card
        variant="framed"
        flush
        title="Access requests"
        badges={<Count tone="neutral">{total}</Count>}
        action={
          <Select
            label="Filter by status"
            value={status}
            options={STATUS_FILTERS}
            onValueChange={(next) => {
              setStatus(next);
              setPage(1);
            }}
          />
        }
      >
        <DataTable
          label="Folder access requests"
          rows={requests}
          columns={columns}
          loading={isPending}
          loadingRows={3}
          getRowId={(request) => request.id}
          rowLabel={(request) => `${request.requesterName}, ${request.accountName ?? "account"}`}
          empty={
            <EmptyState
              size="sm"
              media="bare"
              icon="inbox"
              title={status === "all" ? "No access requests yet" : "No requests with this status"}
            />
          }
          pagination={
            total > perPage ? (
              <Pagination
                label="Access request pages"
                variant="compact"
                page={page}
                total={total}
                pageSize={perPage}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPerPage(size);
                  setPage(1);
                  setUserTablePreference(TABLE_PREFERENCE, PreferenceKey.PerPage, size);
                }}
              />
            ) : undefined
          }
        />
      </Card>
      <ConfirmAction
        open={Boolean(revoking)}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revoke access?"
        description={`${revoking?.requesterName ?? "This requester"} loses access to ${revoking?.accountName ?? "the account"} immediately.`}
        confirmText="revoke"
        action="Revoke"
        onConfirm={async () => {
          if (!revoking?.grantId) return false;
          try {
            await revoke.mutateAsync({ grantId: revoking.grantId });
            saved("Access revoked");
            return true;
          } catch (error) {
            failed("Failed to revoke access", error);
            return false;
          }
        }}
      />
    </>
  );
};

type Draft = {
  approvers: Approver[];
  breakGlass: Approver[];
  notifications: TPamNotificationConfig[];
  autoApproval: TAutoApprovalDraft;
};

const draftChanges = (draft: Draft, current: Draft) => ({
  notifications: JSON.stringify(draft.notifications) !== JSON.stringify(current.notifications),
  autoApproval:
    serializeAutoApprovalDraft(draft.autoApproval) !==
    serializeAutoApprovalDraft(current.autoApproval),
  any:
    JSON.stringify(draft.approvers) !== JSON.stringify(current.approvers) ||
    JSON.stringify(draft.breakGlass) !== JSON.stringify(current.breakGlass) ||
    JSON.stringify(draft.notifications) !== JSON.stringify(current.notifications) ||
    serializeAutoApprovalDraft(draft.autoApproval) !==
      serializeAutoApprovalDraft(current.autoApproval)
});

const ApprovalsEditor = ({
  folderId,
  lead,
  canRevoke,
  initialDraft: savedState,
  slugById,
  onDirtyChange
}: {
  folderId: string;
  lead: ReactNode;
  canRevoke: boolean;
  initialDraft: Draft;
  slugById: Record<string, string>;
  onDirtyChange: (dirty: boolean) => void;
}) => {
  const pamAccess = useV4Adapter("pamAccess");
  const directory = usePamDirectory();
  const { data: folderMembers } = pamAccess.useFolderMembers(folderId);
  const scope = folderAutoApprovalScope(folderId);
  const { data: catalog } = pamAccess.useAutoApprovalCatalog(scope);
  const setConfig = pamAccess.useSetApprovalConfig();
  const [edited, setEdited] = useState<Draft | null>(null);
  const draft = edited ?? savedState;
  const latest = useRef(savedState);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const { approvers, breakGlass, notifications, autoApproval } = draft;
  const changes = draftChanges(draft, savedState);
  const dirty = changes.any;

  const commit = (next: Draft) => {
    latest.current = next;
    setEdited(next);
    onDirtyChange(draftChanges(next, savedState).any);
  };
  const change = (patch: Partial<Draft>) => commit({ ...latest.current, ...patch });
  const setAutoApproval: Dispatch<SetStateAction<TAutoApprovalDraft>> = (action) =>
    change({
      autoApproval: typeof action === "function" ? action(latest.current.autoApproval) : action
    });
  const reset = () => {
    commit(savedState);
    setShowErrors(false);
    setFormError(undefined);
  };

  const memberUserIds = new Set(
    (folderMembers?.users ?? []).flatMap(({ userId }) => (userId ? [userId] : []))
  );
  const memberGroupIds = new Set(
    (folderMembers?.groups ?? []).flatMap(({ groupId }) => (groupId ? [groupId] : []))
  );
  const optionsExcluding = (selected: Approver[]) => {
    const taken = new Set(selected.map(approverKey));
    return [
      ...directory.groups
        .filter(({ id }) => memberGroupIds.has(id) && !taken.has(`group:${id}`))
        .map(({ id, name }) => ({ value: `group:${id}`, label: name, meta: "Group" })),
      ...directory.users
        .filter(({ id }) => memberUserIds.has(id) && !taken.has(`user:${id}`))
        .map(({ id, name, email }) => ({ value: `user:${id}`, label: name, meta: email }))
    ];
  };
  const toRows = (list: Approver[]): ApproverRow[] =>
    list.map((approver) => {
      if (approver.type === PamApproverType.User) {
        const user = directory.userMap.get(approver.id);
        return { ...approver, name: user?.name ?? approver.id, subtitle: user?.email };
      }
      return { ...approver, name: directory.groupMap.get(approver.id) ?? approver.id };
    });
  const without = (list: Approver[], target: Approver) =>
    list.filter((entry) => approverKey(entry) !== approverKey(target));

  const save = async () => {
    if (breakGlass.length > 0 && approvers.length === 0 && autoApproval.rules.length === 0) {
      setFormError("Break-glass users need approvers or auto-approval rules to skip.");
      return;
    }
    if (autoApproval.rules.some((rule) => !isRuleComplete(rule, catalog?.connections))) {
      setShowErrors(true);
      setFormError("Finish the auto-approval rules before saving.");
      return;
    }
    setFormError(undefined);
    setSaving(true);
    try {
      await setConfig.mutateAsync({
        folderId,
        steps: [{ approvers }],
        breakGlassUsers: breakGlass,
        notificationConfigs: changes.notifications ? notifications : undefined,
        autoApproval: changes.autoApproval ? toAutoApprovalConfig(autoApproval) : undefined
      });
      onDirtyChange(false);
      saved("Approval configuration saved");
    } catch (error) {
      failed("Failed to save approval configuration", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SheetBody>
        <Stack gap={24}>
          {lead}
          <Stack gap={16}>
            <AutoApprovalCard
              scope={scope}
              draft={autoApproval}
              onChange={setAutoApproval}
              showErrors={showErrors}
              hasApprovers={approvers.length > 0}
            />
            <ApproverCard
              title="Approvers"
              label="approver"
              rows={toRows(approvers)}
              options={optionsExcluding(approvers)}
              empty={
                <EmptyState
                  size="sm"
                  media="bare"
                  icon="users"
                  title="No approvers"
                  description="Only folder members can approve requests."
                />
              }
              onAdd={(approver) => change({ approvers: [...latest.current.approvers, approver] })}
              onRemove={(approver) =>
                change({ approvers: without(latest.current.approvers, approver) })
              }
            />
            <ApproverCard
              title="Break-glass users"
              label="break-glass user"
              rows={toRows(breakGlass)}
              options={optionsExcluding(breakGlass)}
              empty={
                <EmptyState
                  size="sm"
                  media="bare"
                  icon="shield"
                  title="No break-glass users"
                  description="Nobody can bypass approval in this folder. Every use is audited and emailed to the skipped approvers."
                />
              }
              onAdd={(approver) => change({ breakGlass: [...latest.current.breakGlass, approver] })}
              onRemove={(approver) =>
                change({ breakGlass: without(latest.current.breakGlass, approver) })
              }
            />
            <FolderAlerts folderId={folderId} />
            {savedState.notifications.length > 0 && (
              <LegacyNotifications
                configs={notifications}
                slugById={slugById}
                onChange={(next) => change({ notifications: next })}
              />
            )}
            <FolderRequests folderId={folderId} canRevoke={canRevoke} />
          </Stack>
        </Stack>
      </SheetBody>
      <SheetFooter>
        <Stack gap={8}>
          {formError && <Alert tone="bad" title={formError} />}
          <Inline gap={8} justify="end">
            <Button variant="outline" disabled={!dirty || saving} onClick={reset}>
              Discard
            </Button>
            <Button
              variant="primary"
              loading={saving}
              disabledReason={dirty ? undefined : "No changes to save"}
              onClick={save}
            >
              Save
            </Button>
          </Inline>
        </Stack>
      </SheetFooter>
    </>
  );
};

export const FolderApprovals = ({
  folderId,
  lead,
  canRevoke,
  onDirtyChange
}: {
  folderId: string;
  lead: ReactNode;
  canRevoke: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) => {
  const { data: config, error } = useV4Adapter("pamAccess").useApprovalConfig(folderId);
  if (!config && error)
    return (
      <SheetBody>
        <Stack gap={24}>
          {lead}
          <EmptyState
            size="sm"
            icon="alert"
            title="Could not load approvals"
            description={errorMessage(error) || "Close the sheet and try again."}
          />
        </Stack>
      </SheetBody>
    );
  if (!config)
    return (
      <SheetBody>
        <Stack gap={24}>
          {lead}
          <Stack gap={12}>
            <Skeleton height={32} width={240} />
            <Skeleton height={160} />
          </Stack>
        </Stack>
      </SheetBody>
    );
  const stored: Draft = {
    approvers: (config.steps?.[0]?.approvers ?? []).map(({ type, id }) => ({ type, id })),
    breakGlass: (config.breakGlassUsers ?? []).map(({ type, id }) => ({ type, id })),
    notifications: (config.notificationConfigs ?? []).map(
      ({ workflowIntegrationId, channels, events }) => ({ workflowIntegrationId, channels, events })
    ),
    autoApproval: toAutoApprovalDraft(config.autoApproval)
  };
  return (
    <ApprovalsEditor
      key={JSON.stringify(stored)}
      folderId={folderId}
      lead={lead}
      canRevoke={canRevoke}
      initialDraft={stored}
      slugById={Object.fromEntries(
        (config.notificationConfigs ?? []).map((entry) => [
          entry.workflowIntegrationId,
          entry.integrationSlug
        ])
      )}
      onDirtyChange={onDirtyChange}
    />
  );
};
