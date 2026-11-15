import { useRef, useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Detail, DetailGroup, DetailLabel, DetailValue } from "@infisical/cipher/ui/detail";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Meta, StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { Link } from "@tanstack/react-router";

import { AgentVaultMemberType, AgentVaultSessionStatus } from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultSession, TAgentVaultSessionActor } from "@app/hooks/api/agentVault/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import {
  actorName,
  actorSubtitle,
  canEditSessionLabel,
  formatSessionExpiry,
  formatTimestamp,
  inlineServiceTarget,
  SESSION_STATUS,
  sessionLabelSchema
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
  const update = useV4Adapter("agentVault").useUpdateSessionLabel(orgId, projectId);
  const stored = session.label ?? "";
  const [draft, setDraft] = useState(stored);
  const [syncedLabel, setSyncedLabel] = useState(stored);
  const [error, setError] = useState<string>();

  if (stored !== syncedLabel) {
    setSyncedLabel(stored);
    if (draft === syncedLabel) setDraft(stored);
  }

  if (!canEditSessionLabel(session))
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
        {session.services.length > 0 && (
          <Detail>
            <DetailLabel>Inline services</DetailLabel>
            <DetailValue>
              <Inline gap={4}>
                {session.services.map((service) => (
                  <Tooltip
                    key={service.id}
                    content={`Sent with this session when it was created, for ${inlineServiceTarget(service)}.`}
                  >
                    <Badge tone="outline" tabIndex={0}>
                      <Icon name="globe" />
                      {service.name}
                    </Badge>
                  </Tooltip>
                ))}
              </Inline>
            </DetailValue>
          </Detail>
        )}
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
    </Stack>
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

  return (
    <Sheet open={Boolean(sessionId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        size="md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (focusLabel) labelRef.current?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>{session?.label ?? "Session"}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {session && (
            <Details orgId={orgId} projectId={projectId} session={session} inputRef={labelRef} />
          )}
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
          <SheetFooter>
            <Inline gap={8} justify="end">
              <Button variant="destructive" icon="x" onClick={() => onRevoke(session)}>
                Revoke session
              </Button>
            </Inline>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};
