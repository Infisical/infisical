import { Children, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  BanIcon,
  BookOpenTextIcon,
  BotIcon,
  PackageIcon,
  PencilIcon,
  UserIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { memberDisplayName, memberSubtitle } from "@app/components/agent-vault/MemberName";
import { hostPatternOf } from "@app/components/agent-vault/service-sheet/serviceSchema";
import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission, useUser } from "@app/context";
import { canActOnAgentVaultSession } from "@app/helpers/agentVaultPermissions";
import { AgentVaultMemberType, AgentVaultSessionStatus } from "@app/hooks/api/agentVault";
import { TAgentVaultSession, TAgentVaultSessionSkill } from "@app/hooks/api/agentVault/types";
import { useAgentVaultSheetState } from "@app/hooks/useAgentVaultSheetState";

import {
  inlineServiceHookText,
  inlineServiceTarget,
  sessionInlineServices,
  sessionInlineSkills,
  sessionListedServices,
  sessionListedSkills
} from "./sessionAccess";
import {
  InlineServicesList,
  ServicesList,
  SessionAccessHoverCard,
  SessionSkillsList
} from "./SessionAccessHoverCard";
import { SessionExpiry } from "./SessionExpiry";
import { SessionLogsPanel } from "./SessionLogsPanel";
import { SessionRequestCount } from "./SessionRequestCount";
import { SessionStatusBadge } from "./SessionStatusBadge";
import { TruncatedText } from "./TruncatedText";

const SHOWN_INLINE_SERVICES = 1;
const SHOWN_SERVICES = 2;
const SHOWN_SKILLS = 2;

// An element rather than a component, so the hover card's trigger hands its ref and handlers to the button itself.
// One text node: a dotted underline restarts its dots at each node, leaving a dash at the seam.
const moreButton = (count: number) => (
  <button
    type="button"
    className="shrink-0 rounded-sm text-muted outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
  >
    <span className="underline decoration-dotted underline-offset-2">{`+${count} more`}</span>
  </button>
);

const SINGLE_ROW_MAX_FIELDS = 5;

// Each column of up to rowsPerColumn rows is a divided cell, so the block never grows taller than rowsPerColumn. A group wraps as one unit, keeping its cells together.
const DetailSection = ({
  label,
  rowsPerColumn,
  children,
  className
}: {
  label: string;
  rowsPerColumn: number;
  children: ReactNode;
  className?: string;
}) => {
  const rows = Children.toArray(children);
  const columns: ReactNode[][] = [];
  for (let i = 0; i < rows.length; i += rowsPerColumn) {
    columns.push(rows.slice(i, i + rowsPerColumn));
  }
  return (
    <div
      role="group"
      aria-label={label}
      className={twMerge(
        "flex min-w-0 flex-[1_1_auto] divide-x divide-border border-t border-l border-border",
        className
      )}
    >
      {columns.map((column, index) => (
        <dl
          // oxlint-disable-next-line react/no-array-index-key
          key={index}
          className="grid min-w-0 flex-[1_1_auto] grid-cols-[auto_minmax(0,1fr)] content-start items-start gap-x-4 gap-y-1.5 px-4 py-2.5"
        >
          {column}
        </dl>
      ))}
    </div>
  );
};

const DetailRow = ({
  label,
  children,
  className
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className="contents">
    <dt className="truncate text-xs leading-5 text-label">{label}</dt>
    <dd
      className={twMerge(
        "flex min-h-5 min-w-0 items-center gap-2 text-sm leading-5 text-foreground",
        className
      )}
    >
      {children}
    </dd>
  </div>
);

// The subtitle shrinks faster than the name, so a narrow column cuts the email before the name.
const MemberValue = ({ name, subtitle }: { name: string; subtitle?: string }) => (
  <span className="flex min-w-0 items-baseline gap-2">
    <span className="truncate">{name}</span>
    {subtitle && <span className="shrink-[4] truncate text-muted">{subtitle}</span>}
  </span>
);

// A session's skills, listed by name or inline: the first few by name, with the rest behind a hover card.
const SkillsRow = ({
  label,
  skills,
  isInline
}: {
  label: string;
  skills: TAgentVaultSessionSkill[];
  isInline: boolean;
}) => {
  const more = skills.slice(SHOWN_SKILLS);
  return (
    <DetailRow label={label} className="gap-x-3">
      {skills.slice(0, SHOWN_SKILLS).map((skill) => (
        <Tooltip key={skill.id}>
          <TooltipTrigger asChild>
            <span className="flex min-w-0 items-center gap-2">
              <BookOpenTextIcon className="size-4 shrink-0 text-muted" />
              <span className="truncate">{skill.name}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            {isInline
              ? "Sent with this session when it was created"
              : "A project skill picked when this session was created"}
            <span className="block">{skill.description}</span>
          </TooltipContent>
        </Tooltip>
      ))}
      {more.length > 0 && (
        <SessionAccessHoverCard content={<SessionSkillsList skills={more} isInline={isInline} />}>
          {moreButton(more.length)}
        </SessionAccessHoverCard>
      )}
    </DetailRow>
  );
};

type Props = {
  session: TAgentVaultSession | undefined;
  isPending?: boolean;
  onRevoke: (session: TAgentVaultSession) => void;
  onEdit: (session: TAgentVaultSession) => void;
};

export const SessionDetailSheet = ({ session, isPending = false, onRevoke, onEdit }: Props) => {
  const { projectId } = useProject();
  const { isOpen, closeSheet } = useAgentVaultSheetState();
  const { currentOrg } = useOrganization();
  const { permission } = useProjectPermission();
  const { user } = useUser();

  const isOwnerDeleted = session?.actor.id === null;
  // The API refuses edits once the owner, or the user it acts on behalf of, is deleted.
  const canEdit =
    !isOwnerDeleted &&
    session?.onBehalfOf?.id !== null &&
    Boolean(session && canActOnAgentVaultSession(permission, user.id, session, "edit"));
  const canRevoke = Boolean(
    session && canActOnAgentVaultSession(permission, user.id, session, "revoke")
  );
  const isMachineIdentity = session?.actor.type === AgentVaultMemberType.MachineIdentity;
  const hasExpired = Boolean(
    session?.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()
  );
  const metadataEntries = Object.entries(session?.metadata ?? {});
  const inlineServices = session ? sessionInlineServices(session) : [];
  const shownInlineServices = inlineServices.slice(0, SHOWN_INLINE_SERVICES);
  const moreInlineServices = inlineServices.slice(SHOWN_INLINE_SERVICES);
  const listedServices = session ? sessionListedServices(session) : [];
  const shownServices = listedServices.slice(0, SHOWN_SERVICES);
  const moreServices = listedServices.slice(SHOWN_SERVICES);
  const listedSkills = session ? sessionListedSkills(session) : [];
  const inlineSkills = session ? sessionInlineSkills(session) : [];
  const hasAccess =
    Boolean(session?.accessBundle) ||
    listedServices.length + inlineServices.length + listedSkills.length + inlineSkills.length > 0;
  const fieldCount = session
    ? [
        true,
        session.onBehalfOf,
        session.accessBundle,
        listedServices.length,
        inlineServices.length,
        listedSkills.length,
        inlineSkills.length,
        true,
        session.revokedAt,
        session.status !== AgentVaultSessionStatus.Revoked,
        session.stats,
        metadataEntries.length
      ].filter(Boolean).length
    : 0;
  const rowsPerColumn = fieldCount <= SINGLE_ROW_MAX_FIELDS ? 1 : 2;
  const shownMetadata = metadataEntries.slice(0, rowsPerColumn);
  const moreMetadata = metadataEntries.slice(rowsPerColumn);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <SheetContent
        size="workspace"
        className="flex h-full max-h-full flex-col gap-y-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {!session && isPending && (
          <Empty className="m-4 border">
            <EmptyHeader>
              <Spinner size="sm" variant="av" />
            </EmptyHeader>
          </Empty>
        )}
        {!session && !isPending && (
          <Empty className="m-4 border">
            <EmptyHeader>
              <EmptyTitle>Session not found</EmptyTitle>
              <EmptyDescription>
                This session doesn&apos;t exist, or you don&apos;t have access to it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {session && (
          <>
            <SheetHeader className="flex-row items-start gap-4 pr-12">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <SheetTitle
                    className={twMerge("min-w-0 break-words", !session.label && "text-muted")}
                  >
                    {session.label ?? "Unlabeled Session"}
                  </SheetTitle>
                  <SessionStatusBadge status={session.status} />
                  {canEdit && (
                    <IconButton
                      variant="ghost"
                      size="xs"
                      className="shrink-0"
                      aria-label="Edit session"
                      onClick={() => onEdit(session)}
                    >
                      <PencilIcon />
                    </IconButton>
                  )}
                </div>
                <SheetDescription>
                  The session&apos;s details and every request the agent made.
                </SheetDescription>
              </div>
              {session.status === AgentVaultSessionStatus.Active && canRevoke && (
                <Button
                  variant="danger"
                  size="sm"
                  className="shrink-0"
                  onClick={() => onRevoke(session)}
                >
                  <BanIcon />
                  Revoke Session
                </Button>
              )}
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
              {/* -ml-px and -mt-px push the dividers at the leading edge and top row past the clipped edge, so only dividers between sections show */}
              <div className="flex shrink-0 flex-wrap overflow-hidden rounded-md border border-border bg-container *:-mt-px *:-ml-px">
                <DetailSection label="Identity" rowsPerColumn={rowsPerColumn}>
                  <DetailRow
                    label={isMachineIdentity ? "Machine Identity" : "User"}
                    className={twMerge(isOwnerDeleted && "text-muted")}
                  >
                    {isMachineIdentity ? (
                      <BotIcon className="size-4 shrink-0 text-muted" />
                    ) : (
                      <UserIcon className="size-4 shrink-0 text-muted" />
                    )}
                    <MemberValue
                      name={`${memberDisplayName(session.actor)}${isOwnerDeleted ? " (deleted)" : ""}`}
                      subtitle={isMachineIdentity ? undefined : memberSubtitle(session.actor)}
                    />
                  </DetailRow>
                  {session.onBehalfOf && (
                    <DetailRow
                      label="On Behalf Of"
                      className={twMerge(!session.onBehalfOf.id && "text-muted")}
                    >
                      <UserIcon className="size-4 shrink-0 text-muted" />
                      <MemberValue
                        name={`${memberDisplayName(session.onBehalfOf)}${session.onBehalfOf.id ? "" : " (deleted)"}`}
                        subtitle={
                          session.onBehalfOf.id ? memberSubtitle(session.onBehalfOf) : undefined
                        }
                      />
                    </DetailRow>
                  )}
                </DetailSection>

                {hasAccess && (
                  <DetailSection label="Access" rowsPerColumn={rowsPerColumn}>
                    {session.accessBundle && (
                      <DetailRow label="Access Bundle">
                        {session.accessBundle.id ? (
                          <Link
                            to="/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/$accessBundleId"
                            params={{
                              orgId: currentOrg.id,
                              projectId,
                              accessBundleId: session.accessBundle.id
                            }}
                            className="group flex min-w-0 items-center gap-2"
                          >
                            <PackageIcon className="size-4 shrink-0 text-muted" />
                            <span className="truncate group-hover:underline group-hover:underline-offset-2">
                              {session.accessBundle.name}
                            </span>
                          </Link>
                        ) : (
                          <span className="flex min-w-0 items-center gap-2 text-muted">
                            <PackageIcon className="size-4 shrink-0" />
                            <span className="truncate">{session.accessBundle.name} (deleted)</span>
                          </span>
                        )}
                      </DetailRow>
                    )}
                    {listedServices.length > 0 && (
                      <DetailRow label="Services" className="gap-x-3">
                        {shownServices.map((service) => (
                          <Tooltip key={service.id}>
                            <TooltipTrigger asChild>
                              <span className="flex min-w-0 items-center gap-2">
                                <ServiceIcon
                                  hostPattern={service.hostPattern}
                                  serviceType={service.type}
                                  className="size-4"
                                />
                                <span className="truncate">{service.name}</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              A project service picked when this session was created
                              {service.description && (
                                <span className="block">{service.description}</span>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        ))}
                        {moreServices.length > 0 && (
                          <SessionAccessHoverCard
                            content={<ServicesList services={moreServices} />}
                          >
                            {moreButton(moreServices.length)}
                          </SessionAccessHoverCard>
                        )}
                      </DetailRow>
                    )}
                    {inlineServices.length > 0 && (
                      <DetailRow label="Inline Services" className="gap-x-3">
                        {shownInlineServices.map((service) => {
                          const hookText = inlineServiceHookText(service);
                          return (
                            <Tooltip key={service.id}>
                              <TooltipTrigger asChild>
                                <span className="flex min-w-0 items-center gap-2">
                                  <ServiceIcon
                                    hostPattern={hostPatternOf(service)}
                                    serviceType={service.type}
                                    className="size-4"
                                  />
                                  <span className="truncate">{service.name}</span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm">
                                Sent with this session when it was created, for{" "}
                                {inlineServiceTarget(service)}
                                {hookText && <span className="block break-all">{hookText}</span>}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                        {moreInlineServices.length > 0 && (
                          <SessionAccessHoverCard
                            content={<InlineServicesList services={moreInlineServices} />}
                          >
                            {moreButton(moreInlineServices.length)}
                          </SessionAccessHoverCard>
                        )}
                      </DetailRow>
                    )}
                    {listedSkills.length > 0 && (
                      <SkillsRow label="Skills" skills={listedSkills} isInline={false} />
                    )}
                    {inlineSkills.length > 0 && (
                      <SkillsRow label="Inline Skills" skills={inlineSkills} isInline />
                    )}
                  </DetailSection>
                )}

                <DetailSection label="Activity" rowsPerColumn={rowsPerColumn}>
                  <DetailRow label="Created">
                    {format(new Date(session.createdAt), "MMM d, yyyy h:mm a")}
                  </DetailRow>
                  {session.revokedAt && (
                    <DetailRow label="Revoked">
                      {format(new Date(session.revokedAt), "MMM d, yyyy h:mm a")}
                    </DetailRow>
                  )}
                  {session.status !== AgentVaultSessionStatus.Revoked && (
                    <DetailRow label={hasExpired ? "Expired" : "Expires"}>
                      <SessionExpiry expiresAt={session.expiresAt} />
                    </DetailRow>
                  )}
                  {session.stats && (
                    <DetailRow label="Requests">
                      <SessionRequestCount stats={session.stats} />
                    </DetailRow>
                  )}
                </DetailSection>

                {metadataEntries.length > 0 && (
                  // One labeled cell holding the key/value pairs, so user-defined keys never read as built-in fields.
                  <DetailSection
                    label="Metadata"
                    rowsPerColumn={rowsPerColumn}
                    className="min-w-72 flex-[3_1_18rem]"
                  >
                    <DetailRow
                      label="Metadata"
                      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5"
                    >
                      {shownMetadata.map(([key, value], index) => (
                        <div key={key} className="contents">
                          <TruncatedText text={key} className="max-w-20 text-muted" isFocusable />
                          <span className="flex min-w-0 items-center gap-2">
                            <TruncatedText text={value} isFocusable />
                            {index === shownMetadata.length - 1 && moreMetadata.length > 0 && (
                              <SessionAccessHoverCard
                                content={
                                  <dl className="grid max-h-72 max-w-md grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 overflow-y-auto text-sm">
                                    {moreMetadata.map(([moreKey, moreValue]) => (
                                      <div key={moreKey} className="contents">
                                        <dt className="max-w-48 break-all text-muted">{moreKey}</dt>
                                        <dd className="break-all">{moreValue}</dd>
                                      </div>
                                    ))}
                                  </dl>
                                }
                              >
                                {moreButton(moreMetadata.length)}
                              </SessionAccessHoverCard>
                            )}
                          </span>
                        </div>
                      ))}
                    </DetailRow>
                  </DetailSection>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
                <SessionLogsPanel session={session} />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
