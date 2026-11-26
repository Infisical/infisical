import { useId, useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import {
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue
} from "@infisical/cipher/ui/detail";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@infisical/cipher/ui/hover-card";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { List, ListRow } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@infisical/cipher/ui/tabs";
import { Meta, SmallText, StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { Link } from "@tanstack/react-router";

import { hostPatternOf } from "@app/components/agent-vault/service-sheet/serviceSchema";
import { AgentVaultMemberType, AgentVaultSessionStatus } from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultSession, TAgentVaultSessionActor } from "@app/hooks/api/agentVault/types";

import { MetadataEditor } from "../../access/org/metadata-editor";
import { failed, readableFailure, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { ServiceIcon } from "../resources/shared";
import { SessionLogsPanel } from "./session-logs-panel";
import {
  actorName,
  actorSubtitle,
  canEditSession,
  formatSessionExpiry,
  formatTimestamp,
  inlineServiceHookText,
  inlineServiceTarget,
  isSameSessionMetadata,
  metadataRecordToRows,
  metadataRowsToRecord,
  SESSION_STATUS,
  sessionInlineServices,
  sessionInlineSkills,
  sessionLabelSchema,
  sessionMetadataErrors,
  sessionNamedServices,
  sessionNamedSkills,
  type TMetadataErrors,
  useCanActOnSession
} from "./sessions";

const ActorValue = ({ actor }: { actor: TAgentVaultSessionActor }) => {
  const isDeleted = actor.id === null;
  const subtitle = actorSubtitle(actor);
  return (
    <Inline gap={8} align="center" wrap={false} style={{ minWidth: 0 }}>
      <Icon name={actor.type === AgentVaultMemberType.MachineIdentity ? "machine" : "user"} />
      <Stack gap={0} style={{ minWidth: 0 }}>
        <span>{isDeleted ? `${actorName(actor)} (deleted)` : actorName(actor)}</span>
        {subtitle && !isDeleted && subtitle !== actorName(actor) && (
          <Meta mono={false}>{subtitle}</Meta>
        )}
      </Stack>
    </Inline>
  );
};

const SHOWN_NAMED_SERVICES = 2;
const SHOWN_INLINE_SERVICES = 1;
const SHOWN_SKILLS = 2;

type TListedService = {
  id: string;
  name: string;
  media: React.ReactNode;
  tooltip: string;
  detail: string | null;
};

const ServiceList = ({
  label,
  caption,
  shown,
  services
}: {
  label: string;
  caption: string;
  shown: number;
  services: TListedService[];
}) => {
  const more = services.slice(shown);
  return (
    <Inline gap={16} align="center">
      {services.slice(0, shown).map((service) => (
        <Tooltip key={service.id} content={service.tooltip}>
          <Inline gap={8} align="center" wrap={false} tabIndex={0} style={{ minWidth: 0 }}>
            {service.media}
            <span className="truncate">{service.name}</span>
          </Inline>
        </Tooltip>
      ))}
      {more.length > 0 && (
        <HoverCard openDelay={150} closeDelay={100}>
          <HoverCardTrigger asChild>
            <Button variant="link" underline="hover">{`+${more.length} more`}</Button>
          </HoverCardTrigger>
          <HoverCardContent align="start">
            <Stack gap={8}>
              <SmallText muted>{caption}</SmallText>
              <List label={label} variant="bare" size="sm">
                {more.map((service) => (
                  <ListRow
                    key={service.id}
                    value={service.id}
                    label={service.name}
                    title={service.name}
                    description={service.detail ?? undefined}
                    media={service.media}
                  />
                ))}
              </List>
            </Stack>
          </HoverCardContent>
        </HoverCard>
      )}
    </Inline>
  );
};

const EditMetadataDialog = ({
  orgId,
  projectId,
  session,
  onClose
}: {
  orgId: string;
  projectId: string;
  session: TAgentVaultSession;
  onClose: () => void;
}) => {
  const update = useV4Adapter("agentVault").useUpdateSession(orgId, projectId);
  const [initial] = useState(() => metadataRecordToRows(session.metadata));
  const [entries, setEntries] = useState(initial);
  const [errors, setErrors] = useState<TMetadataErrors>();
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: JSON.stringify(entries) !== JSON.stringify(initial),
    onDiscard: onClose
  });

  const submit = async () => {
    const metadata = metadataRowsToRecord(entries);
    if (isSameSessionMetadata(metadata, session.metadata)) {
      onClose();
      return;
    }
    await update
      .mutateAsync({ sessionId: session.id, metadata })
      .catch(readableFailure("Couldn't save the session metadata"));
    saved("Session updated");
    onClose();
  };

  return (
    <>
      <MultiStep
        variant="dialog"
        title="Edit metadata"
        open
        onOpenChange={(next) => {
          if (next || update.isPending) return;
          requestDiscard();
        }}
        completeLabel="Save"
        onComplete={submit}
        steps={[
          {
            title: "Metadata",
            validate: () => {
              const next = sessionMetadataErrors(entries);
              setErrors(next);
              if (!next) return true;
              const message =
                next.list ?? next.rows.map((row) => row.key ?? row.value).find(Boolean);
              return message ? { message } : false;
            },
            content: (
              <MetadataEditor
                boxed
                addLabel="Add metadata"
                entries={entries}
                errors={errors?.rows}
                onChange={(next) => {
                  setEntries(next);
                  setErrors(undefined);
                }}
              />
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your metadata changes will be lost."
      />
    </>
  );
};

const MetadataGroup = ({
  orgId,
  projectId,
  session
}: {
  orgId: string;
  projectId: string;
  session: TAgentVaultSession;
}) => {
  const canActOn = useCanActOnSession(projectId);
  const [editing, setEditing] = useState(false);
  const entries = Object.entries(session.metadata);
  const canEdit = canEditSession(session) && canActOn(session, "edit");
  return (
    <DetailGroup>
      <DetailGroupHeader
        level={3}
        action={
          canEdit && (
            <Button variant="ghost" size="xs" icon="pencil" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )
        }
      >
        Metadata
      </DetailGroupHeader>
      {entries.length > 0 ? (
        entries.map(([key, value]) => (
          <Detail key={key}>
            <DetailLabel>{key}</DetailLabel>
            <DetailValue>{value}</DetailValue>
          </Detail>
        ))
      ) : (
        <Meta mono={false}>No metadata</Meta>
      )}
      {editing && (
        <EditMetadataDialog
          orgId={orgId}
          projectId={projectId}
          session={session}
          onClose={() => setEditing(false)}
        />
      )}
    </DetailGroup>
  );
};

const LabelField = ({
  orgId,
  projectId,
  session,
  inputRef
}: {
  orgId: string;
  projectId: string;
  session: TAgentVaultSession;
  inputRef: React.Ref<HTMLInputElement>;
}) => {
  const update = useV4Adapter("agentVault").useUpdateSession(orgId, projectId);
  const canActOn = useCanActOnSession(projectId);
  const stored = session.label ?? "";
  const [draft, setDraft] = useState(stored);
  const [syncedLabel, setSyncedLabel] = useState(stored);
  const [error, setError] = useState<string>();

  if (stored !== syncedLabel) {
    setSyncedLabel(stored);
    if (draft === syncedLabel) setDraft(stored);
  }

  if (!canEditSession(session) || !canActOn(session, "edit"))
    return (
      <Detail>
        <DetailLabel>Label</DetailLabel>
        <DetailValue>{session.label ?? <Meta mono={false}>No label</Meta>}</DetailValue>
      </Detail>
    );

  const save = async () => {
    const parsed = sessionLabelSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    if (parsed.data === stored) {
      setDraft(stored);
      return;
    }
    try {
      await update.mutateAsync({ sessionId: session.id, label: parsed.data || null });
      saved(parsed.data ? "Session label saved" : "Session label removed");
    } catch (cause) {
      setDraft(stored);
      failed("Failed to save the session label", cause);
    }
  };

  return (
    <Field label="Label" error={error} description="Saves when you leave the field.">
      <Input
        ref={inputRef}
        value={draft}
        placeholder="Nightly deploy"
        invalid={Boolean(error)}
        disabled={update.isPending}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(undefined);
        }}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape" && draft !== stored) {
            event.preventDefault();
            event.stopPropagation();
            setDraft(stored);
            setError(undefined);
          }
        }}
      />
    </Field>
  );
};

const SkillDetails = ({ session }: { session: TAgentVaultSession }) => {
  const namedSkills = sessionNamedSkills(session);
  const inlineSkills = sessionInlineSkills(session);
  return (
    <>
      {namedSkills.length > 0 && (
        <Detail>
          <DetailLabel>Skills</DetailLabel>
          <DetailValue>
            <ServiceList
              label="Skills"
              caption="The project's skills, named when the session was created."
              shown={SHOWN_SKILLS}
              services={namedSkills.map((skill) => ({
                id: skill.id,
                name: skill.name,
                media: <Icon name="book" />,
                tooltip: `A project skill this session names. ${skill.description}`,
                detail: skill.description
              }))}
            />
          </DetailValue>
        </Detail>
      )}
      {inlineSkills.length > 0 && (
        <Detail>
          <DetailLabel>Inline skills</DetailLabel>
          <DetailValue>
            <ServiceList
              label="Inline skills"
              caption="Sent with the session when it was created."
              shown={SHOWN_SKILLS}
              services={inlineSkills.map((skill) => ({
                id: skill.id,
                name: skill.name,
                media: <Icon name="book" />,
                tooltip: `Sent with this session when it was created. ${skill.description}`,
                detail: skill.description
              }))}
            />
          </DetailValue>
        </Detail>
      )}
    </>
  );
};

const Details = ({
  orgId,
  projectId,
  session,
  inputRef
}: {
  orgId: string;
  projectId: string;
  session: TAgentVaultSession;
  inputRef: React.Ref<HTMLInputElement>;
}) => {
  const { label, tone, icon } = SESSION_STATUS[session.status];
  const hasExpired = Boolean(
    session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()
  );
  const inlineServices = sessionInlineServices(session);
  const namedServices = sessionNamedServices(session);
  return (
    <Stack gap={24}>
      <LabelField
        key={session.id}
        orgId={orgId}
        projectId={projectId}
        session={session}
        inputRef={inputRef}
      />
      <DetailGroup>
        <Detail>
          <DetailLabel>Status</DetailLabel>
          <DetailValue>
            <StatusText tone={tone} icon={icon}>
              {label}
            </StatusText>
          </DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>
            {session.actor.type === AgentVaultMemberType.MachineIdentity
              ? "Machine identity"
              : "User"}
          </DetailLabel>
          <DetailValue>
            <ActorValue actor={session.actor} />
          </DetailValue>
        </Detail>
        {session.onBehalfOf && (
          <Detail>
            <DetailLabel>On behalf of</DetailLabel>
            <DetailValue>
              <ActorValue actor={{ ...session.onBehalfOf, type: AgentVaultMemberType.User }} />
            </DetailValue>
          </Detail>
        )}
        {session.accessBundle && (
          <Detail>
            <DetailLabel>Access bundle</DetailLabel>
            <DetailValue>
              {session.accessBundle.id ? (
                <Button
                  variant="link"
                  underline="hover"
                  icon="package"
                  asChild
                  style={{ maxWidth: "100%" }}
                  title={session.accessBundle.name}
                >
                  <Link
                    to={v4Path(
                      "/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/$accessBundleId"
                    )}
                    params={{ orgId, projectId, accessBundleId: session.accessBundle.id }}
                  >
                    <span className="truncate">{session.accessBundle.name}</span>
                  </Link>
                </Button>
              ) : (
                <Meta mono={false}>{`${session.accessBundle.name} (deleted)`}</Meta>
              )}
            </DetailValue>
          </Detail>
        )}
        {namedServices.length > 0 && (
          <Detail>
            <DetailLabel>Services</DetailLabel>
            <DetailValue>
              <ServiceList
                label="Services"
                caption="The project's services, named when the session was created."
                shown={SHOWN_NAMED_SERVICES}
                services={namedServices.map((service) => ({
                  id: service.id,
                  name: service.name,
                  media: (
                    <ServiceIcon hostPattern={service.hostPattern} serviceType={service.type} />
                  ),
                  tooltip: service.description
                    ? `A project service this session names. ${service.description}`
                    : "A project service this session names",
                  detail: service.description
                }))}
              />
            </DetailValue>
          </Detail>
        )}
        {inlineServices.length > 0 && (
          <Detail>
            <DetailLabel>Inline services</DetailLabel>
            <DetailValue>
              <ServiceList
                label="Inline services"
                caption="Sent with the session when it was created."
                shown={SHOWN_INLINE_SERVICES}
                services={inlineServices.map((service) => {
                  const target = inlineServiceTarget(service);
                  const hookText = inlineServiceHookText(service);
                  return {
                    id: service.id,
                    name: service.name,
                    media: (
                      <ServiceIcon
                        hostPattern={hostPatternOf(service)}
                        serviceType={service.type}
                      />
                    ),
                    tooltip: `Sent with this session when it was created, for ${target}.${
                      hookText ? ` ${hookText}` : ""
                    }`,
                    detail:
                      [target === service.name ? null : target, hookText]
                        .filter(Boolean)
                        .join(" · ") || null
                  };
                })}
              />
            </DetailValue>
          </Detail>
        )}
        <SkillDetails session={session} />
        <Detail>
          <DetailLabel>Created</DetailLabel>
          <DetailValue>{formatTimestamp(session.createdAt)}</DetailValue>
        </Detail>
        {session.revokedAt && (
          <Detail>
            <DetailLabel>Revoked</DetailLabel>
            <DetailValue>{formatTimestamp(session.revokedAt)}</DetailValue>
          </Detail>
        )}
        {session.status !== AgentVaultSessionStatus.Revoked && (
          <Detail>
            <DetailLabel>{hasExpired ? "Expired" : "Expires"}</DetailLabel>
            <DetailValue>
              {session.expiresAt ? (
                <Tooltip content={formatTimestamp(session.expiresAt)}>
                  <span>{formatSessionExpiry(session.expiresAt)}</span>
                </Tooltip>
              ) : (
                "Never, until someone revokes it"
              )}
            </DetailValue>
          </Detail>
        )}
        {session.stats && (
          <Detail>
            <DetailLabel>Requests</DetailLabel>
            <DetailValue>
              {session.stats.requests.toLocaleString()}
              {session.stats.brokered !== null &&
                ` (${session.stats.brokered.toLocaleString()} brokered)`}
            </DetailValue>
          </Detail>
        )}
      </DetailGroup>
      <MetadataGroup orgId={orgId} projectId={projectId} session={session} />
    </Stack>
  );
};

const RevokeFooter = ({
  projectId,
  session,
  onRevoke
}: {
  projectId: string;
  session: TAgentVaultSession;
  onRevoke: (session: TAgentVaultSession) => void;
}) => {
  const canActOn = useCanActOnSession(projectId);
  if (!canActOn(session, "revoke")) return null;
  return (
    <SheetFooter>
      <Inline gap={8} justify="end">
        <Button variant="destructive" icon="x" onClick={() => onRevoke(session)}>
          Revoke session
        </Button>
      </Inline>
    </SheetFooter>
  );
};

export const SessionDetailsSheet = ({
  orgId,
  projectId,
  sessionId,
  loaded,
  focusLabel,
  onClose,
  onRevoke
}: {
  orgId: string;
  projectId: string;
  sessionId: string | undefined;
  loaded: TAgentVaultSession | undefined;
  focusLabel: boolean;
  onClose: () => void;
  onRevoke: (session: TAgentVaultSession) => void;
}) => {
  const { data: fetched, isPending } = useV4Adapter("agentVault").useSession(
    orgId,
    projectId,
    sessionId
  );
  const session = fetched ?? loaded;
  const labelRef = useRef<HTMLInputElement>(null);
  const tabsId = useId();
  const [tab, setTab] = useState<"logs" | "details">("logs");
  const [openedFor, setOpenedFor] = useState(sessionId);
  if (openedFor !== sessionId) {
    setOpenedFor(sessionId);
    if (sessionId) setTab(focusLabel ? "details" : "logs");
  }

  return (
    <Sheet open={Boolean(sessionId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        size="lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (focusLabel) labelRef.current?.focus();
        }}
      >
        <SheetHeader
          tabs={
            session && (
              <Tabs value={tab} onValueChange={(value) => setTab(value as "logs" | "details")}>
                <TabsList aria-label="Session">
                  <TabsTrigger value="logs" id={`${tabsId}-logs`} aria-controls={`${tabsId}-panel`}>
                    Logs
                  </TabsTrigger>
                  <TabsTrigger
                    value="details"
                    id={`${tabsId}-details`}
                    aria-controls={`${tabsId}-panel`}
                  >
                    Details
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )
          }
        >
          <SheetTitle>{session?.label ?? "Session"}</SheetTitle>
        </SheetHeader>
        <SheetBody
          {...(session && {
            role: "tabpanel",
            id: `${tabsId}-panel`,
            "aria-labelledby": `${tabsId}-${tab}`
          })}
        >
          {session &&
            (tab === "logs" ? (
              <SessionLogsPanel
                key={session.id}
                orgId={orgId}
                projectId={projectId}
                session={session}
              />
            ) : (
              <Details orgId={orgId} projectId={projectId} session={session} inputRef={labelRef} />
            ))}
          {!session && isPending && <Loader label="Loading session" />}
          {!session && !isPending && (
            <EmptyState
              size="sm"
              media="bare"
              icon="search"
              title="Session not found"
              description="This session doesn't exist, or you don't have access to it."
            />
          )}
        </SheetBody>
        {session?.status === AgentVaultSessionStatus.Active && (
          <RevokeFooter projectId={projectId} session={session} onRevoke={onRevoke} />
        )}
      </SheetContent>
    </Sheet>
  );
};
