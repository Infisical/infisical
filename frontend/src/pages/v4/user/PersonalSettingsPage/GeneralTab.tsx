import { useEffect, useState } from "react";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { z } from "zod";

import { Alert } from "@app/components/v4/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { SettingsCard } from "@app/components/v4/ui/settings-card";
import { toast } from "@app/components/v4/ui/sonner";
import { Meta } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import type { TokenVersion } from "@app/hooks/api/users/types";
import { timeAgo } from "@app/lib/fn/date";
import { formatSessionUserAgent } from "@app/lib/fn/string";

import { failed } from "../../access/toast";
import { usePersonalSettings } from "../../data/personal/contract";
import { orgHref, v4Path } from "../../links";
import { resolveV4Href } from "../../resolveV4Href";

const nameSchema = z.string().trim().min(1, "Enter your name.");

const fullDate = (date: Date) =>
  date.toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

const useSignedOutHref = () => {
  const { v4Mode } = useRouteContext({ from: "/v4/personal-settings" });
  return v4Mode === "demo" ? orgHref("demo", "/projects") : resolveV4Href(v4Path("/login"), v4Mode);
};

const Profile = () => {
  const personal = usePersonalSettings();
  const { data: user } = personal.useUser();
  const rename = personal.useRenameUser();
  const savedName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const [name, setName] = useState(savedName);
  const [error, setError] = useState<string>();

  useEffect(() => setName(savedName), [savedName]);

  return (
    <SettingsCard
      title="Profile"
      loading={!user}
      dirty={name.trim() !== savedName}
      onDiscard={() => {
        setName(savedName);
        setError(undefined);
      }}
      onSave={async () => {
        const parsed = nameSchema.safeParse(name);
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        try {
          await rename.mutateAsync({ newName: parsed.data });
        } catch (cause) {
          failed("Failed to update name", cause);
          return;
        }
        toast.success("Name updated");
      }}
    >
      <Field label="Name" error={error}>
        <Input
          value={name}
          invalid={Boolean(error)}
          autoComplete="name"
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
        />
      </Field>
    </SettingsCard>
  );
};

const LastAccessed = ({ lastUsed, createdAt }: { lastUsed: Date; createdAt: Date }) => (
  <Stack gap={0}>
    <Tooltip content={fullDate(lastUsed)}>
      <time dateTime={lastUsed.toISOString()} className="w-fit cursor-help">
        {timeAgo(lastUsed, new Date())}
      </time>
    </Tooltip>
    <Tooltip content={fullDate(createdAt)}>
      <Meta mono={false} className="w-fit cursor-help">
        Created {timeAgo(createdAt, new Date())}
      </Meta>
    </Tooltip>
  </Stack>
);

const Sessions = () => {
  const navigate = useNavigate();
  const personal = usePersonalSettings();
  const signedOutHref = useSignedOutHref();
  const { data: sessions = [], isPending, error, refetch } = personal.useSessions();
  const revokeSession = personal.useRevokeSession();
  const revokeAll = personal.useRevokeAllSessions();
  const [revoking, setRevoking] = useState<TokenVersion | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [pending, setPending] = useState(false);

  const columns: DataTableColumn<TokenVersion>[] = [
    {
      id: "ip",
      header: "IP and session ID",
      primary: true,
      grow: true,
      text: (row) => row.ip || "Unknown IP",
      render: (row) => (
        <Stack gap={0}>
          <span>{row.ip || "Unknown IP"}</span>
          <Meta title={row.id}>{row.id}</Meta>
        </Stack>
      )
    },
    {
      id: "device",
      header: "Device",
      width: 220,
      render: (row) => {
        const { os, browser } = formatSessionUserAgent(row.userAgent);
        return (
          <Stack gap={0}>
            <span>{os || "Unknown operating system"}</span>
            <Meta mono={false}>{browser || "Unknown browser"}</Meta>
          </Stack>
        );
      }
    },
    {
      id: "lastUsed",
      header: "Last accessed",
      width: 200,
      render: (row) => (
        <LastAccessed lastUsed={new Date(row.lastUsed)} createdAt={new Date(row.createdAt)} />
      )
    }
  ];

  const signOutSession = async () => {
    if (!revoking) return;
    setPending(true);
    try {
      await revokeSession.mutateAsync(revoking.id);
      toast.success("Session signed out");
      setRevoking(null);
    } catch (cause) {
      failed("Failed to sign out session", cause);
    } finally {
      setPending(false);
    }
  };

  const signOutEverywhere = async () => {
    setPending(true);
    try {
      await revokeAll.mutateAsync();
      setRevokingAll(false);
      personal.endSession();
      navigate({ href: signedOutHref });
    } catch (cause) {
      failed("Failed to sign out everywhere", cause);
    } finally {
      setPending(false);
    }
  };

  const revokingBrowser = revoking ? formatSessionUserAgent(revoking.userAgent).browser : "";

  let body = (
    <DataTable
      label="Sessions"
      rows={sessions}
      columns={columns}
      loading={isPending}
      loadingRows={3}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.ip || row.id}
      rowActions={{
        inline: [{ label: "Sign out", icon: LogOut, onSelect: (row) => setRevoking(row) }]
      }}
    />
  );
  if (error)
    body = (
      <Alert
        tone="bad"
        title="Sessions could not be loaded"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        }
      >
        Check your connection and try again.
      </Alert>
    );
  else if (!isPending && sessions.length === 0)
    body = <EmptyState size="sm" media="bare" icon="monitor" title="No active sessions" />;

  return (
    <>
      <SettingsCard
        flush
        title="Sessions"
        description="Browser and CLI sessions with access to your account."
        action={
          <Button variant="outline" size="xs" onClick={() => setRevokingAll(true)}>
            Sign out everywhere
          </Button>
        }
      >
        {body}
      </SettingsCard>
      <AlertDialog open={Boolean(revoking)} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out this session?</AlertDialogTitle>
            <AlertDialogDescription>
              The {revokingBrowser || "unknown browser"} session from{" "}
              {revoking?.ip || "an unknown IP"} will lose access to your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                signOutSession();
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={revokingAll} onOpenChange={setRevokingAll}>
        <AlertDialogContent pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out everywhere?</AlertDialogTitle>
            <AlertDialogDescription>
              This signs your account out of every browser and CLI, including this session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                signOutEverywhere();
              }}
            >
              Sign out everywhere
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const DELETE_CONFIRMATION = "delete my account";

const DeleteAccount = () => {
  const navigate = useNavigate();
  const personal = usePersonalSettings();
  const signedOutHref = useSignedOutHref();
  const deleteMe = personal.useDeleteMe();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const deleteAccount = async () => {
    setPending(true);
    try {
      await deleteMe.mutateAsync();
      toast.success("Account deleted");
      setOpen(false);
      navigate({ href: signedOutHref });
    } catch (cause) {
      failed("Failed to delete account", cause);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <SettingsCard
        tone="danger"
        title="Delete account"
        description="Permanently delete your account and revoke its access to Infisical."
        hint="This cannot be undone."
        actions={
          <Button variant="destructive" size="sm" icon="trash" onClick={() => setOpen(true)}>
            Delete account
          </Button>
        }
      />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent tone="danger" confirmText={DELETE_CONFIRMATION} pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Your account will permanently lose access to Infisical. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                deleteAccount();
              }}
            >
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const GeneralTab = () => (
  <Stack gap={24}>
    <Profile />
    <Sessions />
    <DeleteAccount />
  </Stack>
);
