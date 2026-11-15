import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
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
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field, FieldSet } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline } from "@infisical/cipher/ui/layout";
import { List, ListRow } from "@infisical/cipher/ui/list";
import slugify from "@sindresorhus/slugify";

import { buildGitHubAppUrl, buildGitHubHostUrl } from "@app/helpers/appConnections";
import type { TGitHubApp } from "@app/hooks/api/gitHubApps/types";

import { useOrgId } from "../access/permissions";
import { failed, saved } from "../access/toast";
import { useV4Adapter } from "../data/adapters";

const NAME_PREFIX = "infisical-";

const appUrl = (app: TGitHubApp, host?: string, instanceType?: "cloud" | "server") =>
  buildGitHubAppUrl(app.slug, app.host ?? host, app.instanceType ?? instanceType);

const CreateGitHubApp = ({
  host,
  instanceType,
  throughGateway,
  onBack,
  onCreate
}: {
  host?: string;
  instanceType?: "cloud" | "server";
  throughGateway: boolean;
  onBack: () => void;
  onCreate: (input: { name: string; githubOrg: string }) => Promise<void>;
}) => {
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [pending, setPending] = useState(false);
  const hostName = buildGitHubHostUrl(host).replace("https://", "");
  const slug = `${NAME_PREFIX}${name.trim() ? slugify(name, { lowercase: true }) : "your-app"}`;
  return (
    <>
      <form
        id="create-github-app"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim()) return;
          setPending(true);
          await onCreate({ name: slug, githubOrg: org.trim() }).finally(() => setPending(false));
        }}
      >
        <FieldSet disabled={pending}>
          <Field
            label="App name"
            description={`${hostName}/${instanceType === "server" ? "github-apps" : "apps"}/${slug}`}
          >
            <Input
              value={name}
              placeholder="deploy-bot"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field
            label="GitHub organization"
            optional
            description="Needed to install the app on the organization's repositories. Leave blank for your personal account."
          >
            <Input mono value={org} onChange={(event) => setOrg(event.target.value)} />
          </Field>
          <Alert tone="info">
            The app is created on {hostName}
            {throughGateway ? " through the selected gateway" : ""}. GitHub fails the setup if
            you&apos;re signed out, so sign in to {hostName} first.
          </Alert>
        </FieldSet>
      </form>
      <DialogFooter>
        <Button
          type="submit"
          form="create-github-app"
          loading={pending}
          disabledReason={name.trim() ? undefined : "Enter an app name."}
        >
          Continue to GitHub
        </Button>
        <Button variant="outline" onClick={onBack} disabled={pending}>
          Back
        </Button>
      </DialogFooter>
    </>
  );
};

/**
 * Main's Manage GitHub Apps dialog: the private GitHub Apps this scope can use, deleting ones no
 * connection uses, and creating a new one through GitHub's manifest flow.
 */
const GitHubAppsDialog = ({
  open,
  onOpenChange,
  projectId,
  host,
  instanceType,
  throughGateway,
  onCreate
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  host?: string;
  instanceType?: "cloud" | "server";
  throughGateway: boolean;
  onCreate: (input: { name: string; githubOrg: string }) => Promise<void>;
}) => {
  const orgId = useOrgId();
  const { data: apps = [], isPending } = useV4Adapter("integrations").useGitHubApps(
    open ? orgId : undefined,
    projectId ?? null
  );
  const deleteApp = useV4Adapter("appConnections").useDeleteGitHubApp();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TGitHubApp>();
  const [deletePending, setDeletePending] = useState(false);
  const privateApps = apps.filter((app) => app.id !== null);
  const deleteBlock = (app: TGitHubApp) => {
    if (projectId && !app.projectId)
      return "Organization apps can only be deleted from the organization's integrations.";
    if (app.connectionCount > 0)
      return `Remove the connection${app.connectionCount === 1 ? "" : "s"} using this app first.`;
    return undefined;
  };
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          if (!next) setCreating(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{creating ? "Create GitHub App" : "Manage GitHub Apps"}</DialogTitle>
          </DialogHeader>
          {creating ? (
            <CreateGitHubApp
              host={host}
              instanceType={instanceType}
              throughGateway={throughGateway}
              onBack={() => setCreating(false)}
              onCreate={onCreate}
            />
          ) : (
            <>
              <List
                label="Private GitHub Apps"
                size="sm"
                loading={isPending}
                empty={
                  <EmptyState
                    size="sm"
                    media="bare"
                    icon="apps"
                    title="No private GitHub Apps yet"
                  />
                }
              >
                {privateApps.map((app) => (
                  <ListRow
                    key={app.id}
                    value={app.id as string}
                    label={app.name}
                    title={app.name}
                    description={`${app.owner ? `${app.owner}, ` : ""}${app.connectionCount} connection${app.connectionCount === 1 ? "" : "s"}`}
                    actions={
                      <>
                        <Button variant="ghost" size="sm" icon="external" asChild>
                          <a
                            href={appUrl(app, host, instanceType)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${app.name} on GitHub`}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="trash"
                          aria-label={`Delete ${app.name}`}
                          disabledReason={deleteBlock(app)}
                          onClick={() => setDeleting(app)}
                        />
                      </>
                    }
                  />
                ))}
              </List>
              <DialogFooter>
                <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                  Create GitHub App
                </Button>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" pending={deletePending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes it from Infisical and uninstalls it from GitHub. The app registration stays on
              GitHub until you delete it there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                if (!deleting?.id) return;
                setDeletePending(true);
                try {
                  await deleteApp.mutateAsync(deleting.id);
                  saved(`${deleting.name} deleted`);
                  setDeleting(undefined);
                } catch (error) {
                  failed("Couldn't delete this GitHub App", error);
                } finally {
                  setDeletePending(false);
                }
              }}
            >
              Delete app
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

/** The Manage GitHub Apps button under the GitHub connection form, with its dialog. */
export const GitHubAppsField = ({
  projectId,
  throughGateway,
  disabled,
  onCreate
}: {
  projectId?: string;
  throughGateway: boolean;
  disabled: boolean;
  onCreate: (input: { name: string; githubOrg: string }) => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Inline>
      <Button
        variant="outline"
        size="sm"
        icon="settings"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Manage GitHub Apps
      </Button>
      <GitHubAppsDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        throughGateway={throughGateway}
        onCreate={onCreate}
      />
    </Inline>
  );
};
