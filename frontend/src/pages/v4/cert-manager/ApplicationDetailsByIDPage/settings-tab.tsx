import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { RowLink } from "@infisical/cipher/ui/row-link";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Switch } from "@infisical/cipher/ui/switch";
import { Text } from "@infisical/cipher/ui/text";
import { formatDistanceToNow } from "date-fns";

import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  AlertRunStatus,
  CertificateAlertResourceType,
  CertificateApplicationAlertEventType,
  type TAlert
} from "@app/hooks/api/alerts/types";
import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  type CertRequestPolicyConditions,
  type TApprovalPolicy
} from "@app/hooks/api/approvalPolicies/types";
import { PkiAlertEventTypeV2, type TPkiAlertV2 } from "@app/hooks/api/pkiAlertsV2/types";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub,
  type TPkiApplication,
  type TPkiApplicationProfile
} from "@app/hooks/api/pkiApplications/types";

import { useProjectPermission } from "../../access/permissions";
import { formatDate } from "../../access/roles";
import { failed, saved } from "../../access/toast";
import { RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import type { PkiApplicationPermission } from "../../data/pki-applications/contract";
import { orgHref, useGo } from "../../links";
import { useProfileCreation, useProfileOptions } from "../ApplicationsPage/application-dialogs";
import { PolicySheet } from "../ApprovalsPage/policy-sheet";
import { canCreateAttachableProfile } from "../components/profile-model";
import { type EnrollmentMethod, EnrollmentSheet, METHOD_LABELS } from "./enrollment-sheet";
import { APPLICATION_DOCS, appCan, copyId, formatAlertBefore } from "./shared";

const methodsOf = (profile: TPkiApplicationProfile) => {
  const methods: EnrollmentMethod[] = [];
  if (profile.apiConfigId) methods.push("api");
  if (profile.estConfigId) methods.push("est");
  if (profile.acmeConfigId) methods.push("acme");
  if (profile.scepConfigId) methods.push("scep");
  return methods;
};

const profileNamesOf = (policy: TApprovalPolicy) =>
  (policy.conditions.conditions as CertRequestPolicyConditions).flatMap(
    (condition) => condition.profileNames
  );

const ago = (date: string) => formatDistanceToNow(new Date(date), { addSuffix: true });

const alertEventLabel: Record<string, string> = {
  [CertificateApplicationAlertEventType.Expiry]: "Certificate expiration",
  [CertificateApplicationAlertEventType.Issuance]: "Certificate issuance",
  [CertificateApplicationAlertEventType.Renewal]: "Certificate renewal",
  [CertificateApplicationAlertEventType.Revocation]: "Certificate revocation"
};

const legacyEventLabel: Record<PkiAlertEventTypeV2, string> = {
  [PkiAlertEventTypeV2.EXPIRATION]: "Certificate expiration",
  [PkiAlertEventTypeV2.RENEWAL]: "Certificate renewal",
  [PkiAlertEventTypeV2.ISSUANCE]: "Certificate issuance",
  [PkiAlertEventTypeV2.REVOCATION]: "Certificate revocation"
};

const LastRun = ({ ok, at }: { ok: boolean; at: string }) => (
  <Badge tone={ok ? "ok" : "bad"} dot>
    {`${ok ? "Sent" : "Failed"} ${ago(at)}`}
  </Badge>
);

const ConfirmDelete = ({
  title,
  description,
  confirmText,
  actionLabel,
  open,
  onClose,
  onConfirm
}: {
  title: string;
  description: string;
  confirmText?: string;
  actionLabel: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
}) => {
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent tone="danger" confirmText={confirmText} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={async (event) => {
              event.preventDefault();
              setPending(true);
              let done = false;
              try {
                done = await onConfirm();
              } finally {
                setPending(false);
              }
              if (done) onClose();
            }}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const AttachProfilesDialog = ({
  application,
  attachedIds,
  onClose
}: {
  application: TPkiApplication;
  attachedIds: string[];
  onClose: () => void;
}) => {
  const attach = useV4Adapter("pkiApplications").useAttachProfiles();
  const { options } = useProfileOptions();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const profileCreation = useProfileCreation((profileId) =>
    setSelected((current) => [...current, profileId])
  );
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: selected.length > 0,
    onDiscard: onClose
  });
  const attached = new Set(attachedIds);
  const available = options.filter((option) => !attached.has(option.value));

  const submit = async () => {
    if (!selected.length) return;
    setPending(true);
    try {
      await attach.mutateAsync({ applicationId: application.id, profileIds: selected });
    } catch (error) {
      failed("Failed to attach profiles", error);
      return;
    } finally {
      setPending(false);
    }
    saved(selected.length === 1 ? "Profile attached" : "Profiles attached");
    onClose();
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestDiscard()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>Attach profiles</DialogTitle>
          </DialogHeader>
          <form
            id="attach-application-profiles"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Field label="Certificate profiles">
              <Combobox
                multiple
                mono
                label="Certificate profiles"
                placeholder="Select profiles"
                emptyText="Every certificate profile is already attached"
                options={available}
                value={selected}
                onValueChange={setSelected}
                {...profileCreation.comboboxProps}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={requestDiscard} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="attach-application-profiles"
              loading={pending}
              disabledReason={selected.length ? undefined : "Select at least one profile"}
            >
              Attach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your pending profile attachments will be lost."
      />
      {profileCreation.sheet}
    </>
  );
};

const ProfilesCard = ({
  orgId,
  projectId,
  application,
  access
}: {
  orgId: string;
  projectId: string;
  application: TPkiApplication;
  access: PkiApplicationPermission;
}) => {
  const go = useGo();
  const adapter = useV4Adapter("pkiApplications");
  const detach = adapter.useDetachProfile();
  const { data, isPending } = adapter.useApplicationProfiles(application.id);
  const { totalCount } = useProfileOptions();
  const { permission } = useProjectPermission(projectId);
  const [attaching, setAttaching] = useState(false);
  const [detaching, setDetaching] = useState<TPkiApplicationProfile>();
  const [configuring, setConfiguring] = useState<{
    profile: TPkiApplicationProfile;
    method?: EnrollmentMethod;
  }>();
  const profiles = data ?? [];
  const canAttach = appCan(
    access,
    PkiApplicationResourceActions.ManageProfiles,
    PkiApplicationResourceSub.Application
  );
  const canConfigure = appCan(
    access,
    PkiApplicationResourceActions.Edit,
    PkiApplicationResourceSub.ApplicationEnrollment
  );
  let attachBlocked: string | undefined;
  const canCreateProfile = canCreateAttachableProfile(permission);
  if (!canAttach) attachBlocked = RESTRICTED;
  else if (!canCreateProfile && totalCount === 0)
    attachBlocked = "No certificate profiles exist yet";
  else if (!canCreateProfile && totalCount <= profiles.length)
    attachBlocked = "Every certificate profile is attached";
  const profileHref = (profile: TPkiApplicationProfile) =>
    orgHref(
      orgId,
      `/cert-manager/certificate-profiles/${profile.profileId}?from=application&applicationName=${encodeURIComponent(application.name)}`
    );

  const columns: DataTableColumn<TPkiApplicationProfile>[] = [
    {
      id: "profile",
      header: "Profile",
      primary: true,
      grow: true,
      mono: true,
      text: (profile) => profile.profileSlug,
      render: (profile) => (
        <RowLink link={go.link(profileHref(profile))} title={profile.profileSlug}>
          {profile.profileSlug}
        </RowLink>
      )
    },
    {
      id: "methods",
      header: "Enrollment methods",
      width: 320,
      render: (profile) => {
        const methods = methodsOf(profile);
        if (!methods.length)
          return canConfigure ? (
            <Button
              variant="link"
              underline="hover"
              onClick={() => setConfiguring({ profile })}
              aria-label={`Configure enrollment for ${profile.profileSlug}`}
            >
              Configure
            </Button>
          ) : (
            <Text muted>Not configured</Text>
          );
        return (
          <Inline gap={4} align="center" wrap={false}>
            {methods.map((method) =>
              canConfigure ? (
                <Badge key={method} size="sm" tone="outline" asChild>
                  <button
                    type="button"
                    aria-label={`Edit ${METHOD_LABELS[method]} enrollment for ${profile.profileSlug}`}
                    onClick={() => setConfiguring({ profile, method })}
                  >
                    {METHOD_LABELS[method]}
                  </button>
                </Badge>
              ) : (
                <Badge key={method} size="sm" tone="outline">
                  {METHOD_LABELS[method]}
                </Badge>
              )
            )}
          </Inline>
        );
      }
    }
  ];

  return (
    <>
      <Card
        variant="framed"
        flush
        title="Certificate profiles"
        badges={
          <DocumentationLink href={APPLICATION_DOCS.enrollment} subject="Enrollment methods" />
        }
        action={
          <Button
            variant="outline"
            icon="plus"
            disabledReason={attachBlocked}
            onClick={() => setAttaching(true)}
          >
            Attach profiles
          </Button>
        }
      >
        <DataTable
          label="Attached certificate profiles"
          rows={profiles}
          loading={isPending}
          loadingRows={2}
          columns={columns}
          getRowId={(profile) => profile.profileId}
          rowLabel={(profile) => profile.profileSlug}
          rowActions={{
            renderMenu: (profile) => (
              <>
                <DropdownMenuItem
                  disabled={!canConfigure}
                  description={canConfigure ? undefined : RESTRICTED}
                  onSelect={() => setConfiguring({ profile })}
                >
                  <Icon name="settings" />
                  Configure enrollment
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canAttach}
                  description={canAttach ? undefined : RESTRICTED}
                  onSelect={() => setDetaching(profile)}
                >
                  <Icon name="trash" />
                  Detach profile
                </DropdownMenuItem>
              </>
            )
          }}
          empty={
            <EmptyState
              size="sm"
              icon="file-key"
              title="No profiles attached"
              description={
                totalCount === 0
                  ? "Create a certificate profile, then configure how this application enrolls against it."
                  : "Attach a certificate profile, then configure how this application enrolls against it."
              }
            />
          }
        />
      </Card>
      {attaching && (
        <AttachProfilesDialog
          application={application}
          attachedIds={profiles.map((profile) => profile.profileId)}
          onClose={() => setAttaching(false)}
        />
      )}
      <ConfirmDelete
        open={Boolean(detaching)}
        title={`Detach ${detaching?.profileSlug ?? "profile"}?`}
        description="This application can no longer issue from this profile. Existing certificates stay."
        confirmText="confirm"
        actionLabel="Detach profile"
        onClose={() => setDetaching(undefined)}
        onConfirm={async () => {
          if (!detaching) return true;
          try {
            await detach.mutateAsync({
              applicationId: application.id,
              profileId: detaching.profileId
            });
          } catch (error) {
            failed("Failed to detach profile", error);
            return false;
          }
          saved(`Detached ${detaching.profileSlug}`);
          return true;
        }}
      />
      <EnrollmentSheet
        applicationId={application.id}
        projectId={projectId}
        profile={configuring?.profile ?? null}
        initialMethod={configuring?.method}
        onClose={() => setConfiguring(undefined)}
        canCreateConnection={permission.can(
          ProjectPermissionAppConnectionActions.Create,
          ProjectPermissionSub.AppConnections
        )}
      />
    </>
  );
};

const PoliciesCard = ({
  projectId,
  application,
  access
}: {
  projectId: string;
  application: TPkiApplication;
  access: PkiApplicationPermission;
}) => {
  const adapter = useV4Adapter("pkiApplications");
  const remove = adapter.useDeletePolicy();
  const { data, isPending } = adapter.useApplicationPolicies(application.id);
  const [editing, setEditing] = useState<TApprovalPolicy>();
  const [deleting, setDeleting] = useState<TApprovalPolicy>();
  const can = (action: PkiApplicationResourceActions) =>
    appCan(access, action, PkiApplicationResourceSub.ApprovalPolicies);
  const canEdit = can(PkiApplicationResourceActions.Edit);
  const canDelete = can(PkiApplicationResourceActions.Delete);
  const policies = [...(data ?? [])].sort(
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
          {canEdit ? (
            <Button variant="link" underline="hover" onClick={() => setEditing(policy)}>
              {policy.name}
            </Button>
          ) : (
            policy.name
          )}
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
      width: 280,
      render: (policy) => {
        const names = profileNamesOf(policy);
        return (
          <Inline gap={4} align="center" wrap={false}>
            {names.slice(0, 3).map((name) => (
              <Badge key={name} size="sm" tone="outline" mono>
                {name}
              </Badge>
            ))}
            {names.length > 3 && <Badge size="sm" tone="soft">{`+${names.length - 3}`}</Badge>}
          </Inline>
        );
      }
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
      width: 168,
      render: (policy) => ago(policy.createdAt)
    }
  ];

  return (
    <>
      <Card
        variant="framed"
        flush
        title="Approval policies"
        badges={<DocumentationLink href={APPLICATION_DOCS.approvals} subject="Approval policies" />}
      >
        <DataTable
          label="Approval policies"
          rows={policies}
          loading={isPending}
          loadingRows={2}
          columns={columns}
          getRowId={(policy) => policy.id}
          rowLabel={(policy) => policy.name}
          rowActions={{
            renderMenu: (policy) => (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    copyId(policy.id);
                    saved("Approval policy ID copied");
                  }}
                >
                  <Icon name="copy" />
                  Copy ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canEdit}
                  description={canEdit ? undefined : RESTRICTED}
                  onSelect={() => setEditing(policy)}
                >
                  <Icon name="pencil" />
                  Edit policy
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canDelete}
                  description={canDelete ? undefined : RESTRICTED}
                  onSelect={() => setDeleting(policy)}
                >
                  <Icon name="trash" />
                  Delete policy
                </DropdownMenuItem>
              </>
            )
          }}
          empty={
            <EmptyState
              size="sm"
              icon="check-c"
              title="No approval policies"
              description="Certificates from this application issue without approval."
            />
          }
        />
      </Card>
      <PolicySheet
        projectId={projectId}
        policy={editing}
        application={{ id: application.id, name: application.name }}
        onClose={() => setEditing(undefined)}
      />
      <ConfirmDelete
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name ?? "policy"}?`}
        description="Certificates from its profiles no longer need this approval. You cannot undo this."
        confirmText="delete"
        actionLabel="Delete policy"
        onClose={() => setDeleting(undefined)}
        onConfirm={async () => {
          if (!deleting) return true;
          try {
            await remove.mutateAsync({
              policyType: ApprovalPolicyType.CertRequest,
              policyId: deleting.id
            });
          } catch (error) {
            failed("Failed to delete policy", error);
            return false;
          }
          saved("Policy deleted");
          return true;
        }}
      />
    </>
  );
};

const AlertsCard = ({
  projectId,
  application,
  access
}: {
  projectId: string;
  application: TPkiApplication;
  access: PkiApplicationPermission;
}) => {
  const adapter = useV4Adapter("pkiApplications");
  const update = adapter.useUpdateAlert();
  const remove = adapter.useDeleteAlert();
  const { data, isPending } = adapter.useApplicationAlerts({
    resourceType: CertificateAlertResourceType.Application,
    projectId,
    resourceId: application.id
  });
  const [deleting, setDeleting] = useState<TAlert>();
  const can = (action: PkiApplicationResourceActions) =>
    appCan(access, action, PkiApplicationResourceSub.PkiAlerts);
  const canEdit = can(PkiApplicationResourceActions.Edit);
  const canDelete = can(PkiApplicationResourceActions.Delete);
  const alerts = data ?? [];

  const toggle = async (alert: TAlert, enabled: boolean) => {
    try {
      await update.mutateAsync({ alertId: alert.id, enabled });
    } catch (error) {
      failed(`Failed to ${enabled ? "enable" : "disable"} ${alert.name}`, error);
      return;
    }
    saved(`${alert.name} ${enabled ? "enabled" : "disabled"}`);
  };

  const columns: DataTableColumn<TAlert>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (alert) => alert.name,
      secondary: (alert) => alert.description || undefined,
      render: (alert) => alert.name
    },
    {
      id: "event",
      header: "Event",
      width: 200,
      render: (alert) => alertEventLabel[alert.eventType] ?? alert.eventType
    },
    {
      id: "before",
      header: "Alert before",
      width: 128,
      render: (alert) => formatAlertBefore(alert.condition?.alertBefore)
    },
    {
      id: "lastRun",
      header: "Last run",
      width: 176,
      render: (alert) =>
        alert.lastRun ? (
          <LastRun
            ok={alert.lastRun.status === AlertRunStatus.Success}
            at={alert.lastRun.timestamp}
          />
        ) : (
          <Text muted>Never</Text>
        )
    },
    {
      id: "enabled",
      header: "Enabled",
      width: 96,
      render: (alert) => (
        <Switch
          size="sm"
          aria-label={`Enable ${alert.name}`}
          checked={alert.enabled}
          disabledReason={canEdit ? undefined : RESTRICTED}
          onCheckedChange={(checked) => toggle(alert, checked)}
        />
      )
    }
  ];

  return (
    <>
      <Card
        variant="framed"
        flush
        title="Alerts"
        badges={<DocumentationLink href={APPLICATION_DOCS.alerting} subject="Alerts" />}
      >
        <DataTable
          label="Application alerts"
          rows={alerts}
          loading={isPending}
          loadingRows={2}
          columns={columns}
          getRowId={(alert) => alert.id}
          rowLabel={(alert) => alert.name}
          isRowMuted={(alert) => !alert.enabled}
          rowActions={{
            renderMenu: (alert) => (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    copyId(alert.id);
                    saved("Alert ID copied");
                  }}
                >
                  <Icon name="copy" />
                  Copy ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canDelete}
                  description={canDelete ? undefined : RESTRICTED}
                  onSelect={() => setDeleting(alert)}
                >
                  <Icon name="trash" />
                  Delete alert
                </DropdownMenuItem>
              </>
            )
          }}
          empty={<EmptyState size="sm" icon="bell" title="No alerts for this application" />}
        />
      </Card>
      <ConfirmDelete
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name ?? "alert"}?`}
        description="Notifications for this alert stop at once. You cannot undo this."
        actionLabel="Delete alert"
        onClose={() => setDeleting(undefined)}
        onConfirm={async () => {
          if (!deleting) return true;
          try {
            await remove.mutateAsync({ alertId: deleting.id });
          } catch (error) {
            failed("Failed to delete alert", error);
            return false;
          }
          saved(`Deleted ${deleting.name}`);
          return true;
        }}
      />
    </>
  );
};

const LegacyAlertSheet = ({ alert, onClose }: { alert?: TPkiAlertV2; onClose: () => void }) => (
  <Sheet open={Boolean(alert)} onOpenChange={(open) => !open && onClose()}>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>{alert?.name ?? "Legacy alert"}</SheetTitle>
      </SheetHeader>
      <SheetBody>
        {alert && (
          <DataList
            variant="props"
            density="compact"
            items={[
              ["Event", legacyEventLabel[alert.eventType] ?? alert.eventType],
              ["Status", alert.enabled ? "Enabled" : "Disabled", { span: "half" }],
              [
                "Alert before",
                alert.eventType === PkiAlertEventTypeV2.EXPIRATION
                  ? formatAlertBefore(alert.alertBefore)
                  : "None",
                { span: "half" }
              ],
              ["Description", alert.description || "None"],
              [
                "Channels",
                alert.channels.length
                  ? alert.channels.map((channel) => channel.channelType).join(", ")
                  : "None"
              ],
              [
                "Filters",
                alert.filters.length ? `${alert.filters.length}` : "None",
                { span: "half" }
              ],
              [
                "Last run",
                alert.lastRun
                  ? `${alert.lastRun.status === "success" ? "Sent" : "Failed"} ${ago(alert.lastRun.timestamp)}`
                  : "Never",
                { span: "half" }
              ],
              ["Created", formatDate(alert.createdAt)]
            ]}
          />
        )}
      </SheetBody>
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);

const LegacyAlertsCard = ({
  application,
  access
}: {
  application: TPkiApplication;
  access: PkiApplicationPermission;
}) => {
  const adapter = useV4Adapter("pkiApplications");
  const remove = adapter.useDeleteLegacyAlert();
  const { data } = adapter.useLegacyAlerts(application.id);
  const [viewing, setViewing] = useState<TPkiAlertV2>();
  const [deleting, setDeleting] = useState<TPkiAlertV2>();
  const canDelete = appCan(
    access,
    PkiApplicationResourceActions.Delete,
    PkiApplicationResourceSub.PkiAlerts
  );
  const alerts = data ?? [];
  if (!alerts.length) return null;

  const columns: DataTableColumn<TPkiAlertV2>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (alert) => alert.name,
      secondary: (alert) => alert.description || undefined,
      render: (alert) => (
        <Button variant="link" underline="hover" onClick={() => setViewing(alert)}>
          {alert.name}
        </Button>
      )
    },
    {
      id: "event",
      header: "Event",
      width: 200,
      render: (alert) => legacyEventLabel[alert.eventType] ?? alert.eventType
    },
    {
      id: "status",
      header: "Status",
      width: 112,
      render: (alert) => (
        <Badge tone={alert.enabled ? "ok" : "outline"} dot>
          {alert.enabled ? "Enabled" : "Disabled"}
        </Badge>
      )
    },
    {
      id: "before",
      header: "Alert before",
      width: 128,
      render: (alert) =>
        alert.eventType === PkiAlertEventTypeV2.EXPIRATION
          ? formatAlertBefore(alert.alertBefore)
          : "None"
    },
    {
      id: "lastRun",
      header: "Last run",
      width: 176,
      render: (alert) =>
        alert.lastRun ? (
          <LastRun ok={alert.lastRun.status === "success"} at={alert.lastRun.timestamp} />
        ) : (
          <Text muted>Never</Text>
        )
    }
  ];

  return (
    <>
      <Card
        variant="framed"
        flush
        title="Legacy alerts"
        hint="Legacy alerts still send notifications but can no longer be edited. Recreate them as alerts above, then delete these."
        badges={
          <Badge size="sm" tone="soft">
            Legacy
          </Badge>
        }
      >
        <DataTable
          label="Legacy alerts"
          rows={alerts}
          columns={columns}
          getRowId={(alert) => alert.id}
          rowLabel={(alert) => alert.name}
          rowActions={{
            renderMenu: (alert) => (
              <>
                <DropdownMenuItem onSelect={() => setViewing(alert)}>
                  <Icon name="eye" />
                  View details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canDelete}
                  description={canDelete ? undefined : RESTRICTED}
                  onSelect={() => setDeleting(alert)}
                >
                  <Icon name="trash" />
                  Delete alert
                </DropdownMenuItem>
              </>
            )
          }}
        />
      </Card>
      <LegacyAlertSheet alert={viewing} onClose={() => setViewing(undefined)} />
      <ConfirmDelete
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name ?? "alert"}?`}
        description="Notifications for this legacy alert stop at once. You cannot undo this."
        actionLabel="Delete alert"
        onClose={() => setDeleting(undefined)}
        onConfirm={async () => {
          if (!deleting) return true;
          try {
            await remove.mutateAsync({ alertId: deleting.id, applicationId: application.id });
          } catch (error) {
            failed("Failed to delete alert", error);
            return false;
          }
          saved(`Deleted ${deleting.name}`);
          return true;
        }}
      />
    </>
  );
};

export const SettingsTab = ({
  orgId,
  projectId,
  application,
  access
}: {
  orgId: string;
  projectId: string;
  application: TPkiApplication;
  access: PkiApplicationPermission;
}) => (
  <Stack gap={24}>
    <ProfilesCard orgId={orgId} projectId={projectId} application={application} access={access} />
    <PoliciesCard projectId={projectId} application={application} access={access} />
    <AlertsCard projectId={projectId} application={application} access={access} />
    <LegacyAlertsCard application={application} access={access} />
  </Stack>
);
