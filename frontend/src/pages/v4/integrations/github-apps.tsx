import { useRef, useState } from "react";
import { type Control, Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
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
import { z } from "zod";

import { buildGitHubAppUrl, buildGitHubHostUrl } from "@app/helpers/appConnections";
import type { TGitHubApp } from "@app/hooks/api/gitHubApps/types";

import { useOrgId } from "../access/permissions";
import { failed, saved } from "../access/toast";
import { useV4Adapter } from "../data/adapters";

const NAME_PREFIX = "infisical-";
const FORM_ID = "create-github-app";

const createSchema = z.object({
  name: z.string().trim().min(1, { message: "Enter an app name" }),
  githubOrg: z.string().trim()
});

type CreateDraft = z.infer<typeof createSchema>;

/** The GitHub instance the connection form points at, which the new app is created on. */
export type GitHubInstance = { host?: string; instanceType?: "cloud" | "server" };

const appUrl = (app: TGitHubApp, instance: GitHubInstance) =>
  buildGitHubAppUrl(app.slug, app.host ?? instance.host, app.instanceType ?? instance.instanceType);

const CreateGitHubApp = ({
  control,
  instance,
  throughGateway,
  pending
}: {
  control: Control<CreateDraft>;
  instance: GitHubInstance;
  throughGateway: boolean;
  pending: boolean;
}) => {
  const name = useWatch({ control, name: "name" });
  const hostName = buildGitHubHostUrl(
    instance.instanceType === "server" ? instance.host : undefined
  ).replace("https://", "");
  const slug = `${NAME_PREFIX}${name.trim() ? slugify(name, { lowercase: true }) : "your-app"}`;
  return (
    <FieldSet disabled={pending}>
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <Field
            label="App name"
            error={error?.message}
            description={`${hostName}/${instance.instanceType === "server" ? "github-apps" : "apps"}/${slug}`}
          >
            <Input {...field} invalid={Boolean(error)} placeholder="deploy-bot" />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="githubOrg"
        render={({ field }) => (
          <Field
            label="GitHub organization"
            optional
            description="Needed to install the app on the organization's repositories. Leave blank for your personal account."
          >
            <Input {...field} mono />
          </Field>
        )}
      />
      <Alert tone="info">
        The app is created on {hostName}
        {throughGateway ? " through the selected gateway" : ""}. GitHub fails the setup if
        you&apos;re signed out, so sign in to {hostName} first.
      </Alert>
    </FieldSet>
  );
};

/**
 * Main's Manage GitHub Apps dialog: the private GitHub Apps this scope can use, deleting ones no
 * connection uses, and creating a new one through GitHub's manifest flow.
 */
const GitHubAppsDialog = ({
  onClose,
  projectId,
  instance,
  throughGateway,
  onCreate,
  onDeleted
}: {
  onClose: () => void;
  projectId?: string;
  instance: GitHubInstance;
  throughGateway: boolean;
  onCreate: (input: { name: string; githubOrg: string }) => Promise<void>;
  onDeleted: (appId: string) => void;
}) => {
  const orgId = useOrgId();
  const { data: apps = [], isPending } = useV4Adapter("integrations").useGitHubApps(
    orgId,
    projectId ?? null
  );
  const deleteApp = useV4Adapter("appConnections").useDeleteGitHubApp();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TGitHubApp>();
  const [deletePending, setDeletePending] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting }
  } = useForm<CreateDraft>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", githubOrg: "" }
  });
  const discardAction = useRef<() => void>(onClose);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: creating && isDirty,
    onDiscard: () => discardAction.current()
  });
  const request = (action: () => void) => {
    discardAction.current = action;
    requestDiscard();
  };
  const back = () => {
    reset();
    setCreating(false);
  };
  const submit = handleSubmit(async (draft) => {
    await onCreate({
      name: `${NAME_PREFIX}${slugify(draft.name, { lowercase: true })}`,
      githubOrg: draft.githubOrg
    });
  });
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
      <Dialog open onOpenChange={(next) => !next && !isSubmitting && request(onClose)}>
        <DialogContent pending={isSubmitting}>
          <DialogHeader>
            <DialogTitle>{creating ? "Create GitHub App" : "Manage GitHub Apps"}</DialogTitle>
          </DialogHeader>
          {creating ? (
            <form id={FORM_ID} noValidate onSubmit={submit}>
              <CreateGitHubApp
                control={control}
                instance={instance}
                throughGateway={throughGateway}
                pending={isSubmitting}
              />
            </form>
          ) : (
            <List
              label="Private GitHub Apps"
              size="sm"
              loading={isPending}
              empty={
                <EmptyState size="sm" media="bare" icon="apps" title="No private GitHub Apps yet" />
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
                          href={appUrl(app, instance)}
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
          )}
          <DialogFooter>
            {creating ? (
              <>
                <Button key="continue" type="submit" form={FORM_ID} loading={isSubmitting}>
                  Continue to GitHub
                </Button>
                <Button variant="outline" onClick={() => request(back)} disabled={isSubmitting}>
                  Back
                </Button>
              </>
            ) : (
              <>
                <Button
                  key="create"
                  variant="primary"
                  icon="plus"
                  onClick={() => setCreating(true)}
                >
                  Create GitHub App
                </Button>
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="The GitHub App details you entered will be lost."
      />
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
                  onDeleted(deleting.id);
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
  readInstance,
  onCreate,
  onDeleted
}: {
  projectId?: string;
  throughGateway: boolean;
  disabled: boolean;
  readInstance: () => GitHubInstance;
  onCreate: (input: { name: string; githubOrg: string }) => Promise<void>;
  onDeleted: (appId: string) => void;
}) => {
  const [instance, setInstance] = useState<GitHubInstance>();
  return (
    <Inline>
      <Button
        variant="outline"
        size="sm"
        icon="settings"
        disabled={disabled}
        onClick={() => setInstance(readInstance())}
      >
        Manage GitHub Apps
      </Button>
      {instance && (
        <GitHubAppsDialog
          onClose={() => setInstance(undefined)}
          projectId={projectId}
          instance={instance}
          throughGateway={throughGateway}
          onCreate={onCreate}
          onDeleted={onDeleted}
        />
      )}
    </Inline>
  );
};
