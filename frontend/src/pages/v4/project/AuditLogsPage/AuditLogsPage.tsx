import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { DocumentationLinkBadge } from "@infisical/cipher/ui/documentation-link-badge";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import { Switch } from "@infisical/cipher/ui/switch";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import {
  ProjectPermissionAuditLogsActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { isInfisicalCloud } from "@app/helpers/platform";
import { getProjectTitle, isOrgScopedProduct } from "@app/helpers/project";
import {
  ALWAYS_RECORDED_AUDIT_LOG_EVENT_CLASSES,
  AUDIT_LOG_EVENT_CLASS_DEFAULTS,
  AUDIT_LOG_EVENT_CLASSES,
  auditLogEventClassToDescriptionMap,
  auditLogEventClassToNameMap,
  CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES
} from "@app/hooks/api/auditLogSettings/constants";
import { AuditLogEventClass } from "@app/hooks/api/auditLogSettings/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useProjectPermission } from "../../access/permissions";
import { useProjectScope } from "../../access/project/scope";
import { toast } from "../../access/toast";
import { AccessRestricted } from "../../access/ui";
import {
  CertManagerNotSetUp,
  useCertManagerProjectId
} from "../../cert-manager/components/certificate";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref } from "../../links";
import { AuditLogsTab } from "../../organization/AuditLogsPage/AuditLogsPage";
import { PageLoader } from "../../shell/project-gate";

const tabs = [
  { value: "audit-logs", label: "Audit logs" },
  { value: "settings", label: "Settings" }
];

const MAX_RETENTION_DAYS = 36_500;
const EDIT_REQUIRED = "You need the Edit permission on Audit Logs to change these settings.";

const scopeOf = (type: ProjectType) =>
  isOrgScopedProduct(type) ? `your ${getProjectTitle(type)}` : "this project";

type Scope = { projectId: string; projectType: ProjectType };

const EventClassesCard = ({ projectId, projectType, canEdit }: Scope & { canEdit: boolean }) => {
  const { organization } = useV4Session();
  const adapter = useV4Adapter("auditLogs");
  const { data: plan } = adapter.usePlan(organization.id);
  const { data: org } = useV4Adapter("org").useOrganization(organization.id);
  const { data: settings, isPending, error } = adapter.useProjectSettings(projectId);
  const update = adapter.useUpdateProjectSettings();
  const newPrivileges =
    settings?.shouldUseNewPrivilegeSystem ?? org?.shouldUseNewPrivilegeSystem ?? false;
  const stored = Object.fromEntries(
    AUDIT_LOG_EVENT_CLASSES.map((eventClass) => [
      eventClass,
      settings?.eventClasses.find((entry) => entry.eventClass === eventClass)?.isEnabled ??
        AUDIT_LOG_EVENT_CLASS_DEFAULTS[eventClass]
    ])
  ) as Record<AuditLogEventClass, boolean>;
  const [draft, setDraft] = useState<Partial<Record<AuditLogEventClass, boolean>>>({});
  const current = { ...stored, ...draft };
  const dirty = AUDIT_LOG_EVENT_CLASSES.some(
    (eventClass) => current[eventClass] !== stored[eventClass]
  );

  let locked: string | undefined;
  if (!canEdit) locked = EDIT_REQUIRED;
  else if (plan && !plan.auditLogs) locked = "Choosing recorded events needs a paid plan.";

  if (error)
    return (
      <SettingsCard title="Event classes">
        <EmptyState
          size="sm"
          media="bare"
          icon="alert"
          title="Couldn't load the audit log settings"
          description="Refresh the page to try again."
        />
      </SettingsCard>
    );

  return (
    <SettingsCard
      title="Event classes"
      description={`Choose which classes of events ${scopeOf(projectType)} records.`}
      loading={isPending}
      dirty={dirty}
      locked={locked}
      onDiscard={() => setDraft({})}
      onSave={async () => {
        const saved = await update.mutateAsync({
          projectId,
          eventClasses: CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES.map((eventClass) => ({
            eventClass,
            isEnabled:
              eventClass === AuditLogEventClass.Authorization && !newPrivileges
                ? false
                : current[eventClass]
          }))
        });
        setDraft({});
        toast({ tone: "ok", title: "Audit log settings saved" });
        return saved;
      }}
    >
      <Stack gap={16}>
        {AUDIT_LOG_EVENT_CLASSES.map((eventClass) => {
          const always = ALWAYS_RECORDED_AUDIT_LOG_EVENT_CLASSES.includes(eventClass);
          const needsPrivileges = eventClass === AuditLogEventClass.Authorization && !newPrivileges;
          let description = auditLogEventClassToDescriptionMap[eventClass];
          if (always) description = `${description} Always recorded.`;
          if (needsPrivileges)
            description = `${description} Only recorded on the new privilege system.`;
          return (
            <Switch
              key={eventClass}
              layout="row"
              label={auditLogEventClassToNameMap[eventClass]}
              description={description}
              checked={always || (!needsPrivileges && current[eventClass])}
              disabled={always || needsPrivileges || Boolean(locked)}
              onCheckedChange={(checked) => setDraft({ ...draft, [eventClass]: checked })}
            />
          );
        })}
        {!newPrivileges && (
          <Button variant="link" underline="hover" asChild>
            <a href={orgHref(organization.id, "/access-management")}>
              Upgrade the privilege system in access control
            </a>
          </Button>
        )}
      </Stack>
    </SettingsCard>
  );
};

const RetentionCard = ({ projectId, projectType, canEdit }: Scope & { canEdit: boolean }) => {
  const { organization } = useV4Session();
  const adapter = useV4Adapter("auditLogs");
  const { data: plan } = adapter.usePlan(organization.id);
  const { data: project, isPending } = useV4Adapter("access").useProject(projectId);
  const update = adapter.useUpdateProjectRetention();
  const unlimited = plan?.auditLogsRetentionDays === null;
  const initial =
    project?.auditLogsRetentionDays || (unlimited ? 0 : (plan?.auditLogsRetentionDays ?? 0));
  const [saved, setSaved] = useState<number>();
  const stored = saved ?? initial;
  const [draft, setDraft] = useState<string>();
  const text = draft ?? (unlimited && !stored ? "" : String(stored));
  const days = text === "" ? 0 : Number(text);
  const invalid = !Number.isInteger(days) || days < 0 || days > MAX_RETENTION_DAYS;

  let locked: string | undefined;
  if (!canEdit) locked = EDIT_REQUIRED;
  else if (plan && !plan.auditLogs) locked = "Configuring retention needs a paid plan.";

  return (
    <SettingsCard
      title="Retention"
      description={`Set how many days to keep audit logs for ${scopeOf(projectType)}.`}
      loading={isPending}
      dirty={draft !== undefined && days !== stored}
      locked={locked}
      onDiscard={() => setDraft(undefined)}
      onSave={async () => {
        if (invalid) throw new Error(`Enter a whole number of days up to ${MAX_RETENTION_DAYS}.`);
        if (plan?.auditLogsRetentionDays != null && days > plan.auditLogsRetentionDays)
          throw new Error(
            `Your plan keeps audit logs for up to ${plan.auditLogsRetentionDays} days. Upgrade to keep them longer.`
          );
        await update.mutateAsync({ projectId, auditLogsRetentionDays: days });
        setSaved(days);
        setDraft(undefined);
        toast({ tone: "ok", title: "Audit log retention updated" });
      }}
    >
      <Field
        label="Number of days"
        description={
          unlimited ? "Leave empty to use your plan's retention, which has no limit." : undefined
        }
        error={invalid ? `Enter a whole number of days up to ${MAX_RETENTION_DAYS}.` : undefined}
      >
        <Input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={text}
          placeholder={unlimited ? "Unlimited" : undefined}
          invalid={invalid}
          disabled={Boolean(locked)}
          onChange={(event) => setDraft(event.target.value)}
        />
      </Field>
    </SettingsCard>
  );
};

const SettingsTab = (scope: Scope) => {
  const { permission } = useProjectPermission(scope.projectId);
  const canEdit = permission.can(
    ProjectPermissionAuditLogsActions.Edit,
    ProjectPermissionSub.AuditLogs
  );
  return (
    <Stack gap={24}>
      <EventClassesCard {...scope} canEdit={canEdit} />
      {!isInfisicalCloud() && <RetentionCard {...scope} canEdit={canEdit} />}
    </Stack>
  );
};

const ProjectAuditLogs = ({ projectId, projectType }: Scope) => {
  const navigate = useNavigate();
  const { selectedTab } = useSearch({ strict: false });
  const { permission, isPending } = useProjectPermission(projectId);
  const activeTab = tabs.some((tab) => tab.value === selectedTab) ? selectedTab : "audit-logs";
  const readable =
    projectType === ProjectType.PAM ||
    permission.can(ProjectPermissionAuditLogsActions.Read, ProjectPermissionSub.AuditLogs);
  const settingsReadable = permission.can(
    ProjectPermissionAuditLogsActions.Read,
    ProjectPermissionSub.AuditLogs
  );

  let body = <AuditLogsTab project={{ id: projectId, type: projectType }} />;
  if (activeTab === "settings")
    body = settingsReadable ? (
      <SettingsTab projectId={projectId} projectType={projectType} />
    ) : (
      <AccessRestricted requirement="read Audit Logs" />
    );
  else if (!readable) body = <AccessRestricted requirement="read Audit Logs" />;

  return (
    <Stack gap={24}>
      <PageHeader
        title="Audit logs"
        description={`Review who did what in ${scopeOf(projectType)}, and when.`}
        badges={
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/audit-logs" />
        }
        tabs={
          <Tabs
            label="Audit log sections"
            value={activeTab}
            onValueChange={(next) =>
              navigate({ to: ".", search: (prev) => ({ ...prev, selectedTab: next }) })
            }
            tabs={tabs.map((tab) => ({ ...tab, content: null }))}
          />
        }
      />
      {isPending ? <PageLoader label="Loading audit logs" /> : body}
    </Stack>
  );
};

export const ProjectAuditLogsPage = () => {
  const { projectId, projectType } = useProjectScope();
  return <ProjectAuditLogs key={projectId} projectId={projectId} projectType={projectType} />;
};

export const CertManagerAuditLogsPage = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId" });
  const { projectId, isPending } = useCertManagerProjectId(orgId);
  if (isPending) return <PageLoader label="Loading audit logs" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;
  return <ProjectAuditLogs projectId={projectId} projectType={ProjectType.CertificateManager} />;
};

export const PamAuditLogsPage = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId" });
  const { data: projectId, isPending } = useV4Adapter("auditLogs").usePamProjectId(orgId);
  if (isPending || !projectId) return <PageLoader label="Loading audit logs" />;
  return <ProjectAuditLogs projectId={projectId} projectType={ProjectType.PAM} />;
};
