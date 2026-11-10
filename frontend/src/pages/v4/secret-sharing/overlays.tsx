import { useId, useState } from "react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import type { Organization } from "@app/hooks/api/organization/types";
import { SecretSharingAccessType } from "@app/hooks/api/secretSharing/types";

import { toast } from "../access/toast";
import { useV4Adapter } from "../data/adapters";
import { LinkResult, secretRequestLink, writeLink } from "./links";
import { EXPIRES_IN_OPTIONS, formatExpiry, useShareSecretForm } from "./share-secret-form";

import styles from "./secret-sharing.module.css";

export const ShareSecretSheet = ({
  open,
  onOpenChange,
  organization,
  subOrganization
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization?: Organization;
  subOrganization?: string;
}) => {
  const formId = useId();
  const create = useV4Adapter("secretSharing").useCreateSharedSecret();
  const [discarding, setDiscarding] = useState(false);
  const form = useShareSecretForm({
    isPublic: false,
    create,
    formId,
    subOrganization,
    allowSecretSharingOutsideOrganization:
      organization?.allowSecretSharingOutsideOrganization ?? true,
    maxSharedSecretLifetime: organization?.maxSharedSecretLifetime,
    maxSharedSecretViewLimit: organization?.maxSharedSecretViewLimit
  });
  const close = () => {
    form.reset();
    onOpenChange(false);
  };
  const requestClose = () => (form.dirty ? setDiscarding(true) : close());
  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && requestClose()}>
        <SheetContent className={styles.sheet} pending={form.pending}>
          <SheetHeader>
            <SheetTitle>Share a secret</SheetTitle>
          </SheetHeader>
          <SheetBody>{form.body}</SheetBody>
          <SheetFooter>
            <Inline gap={8} justify="end">
              {!form.hasResult && (
                <Button type="button" variant="ghost" onClick={requestClose}>
                  Cancel
                </Button>
              )}
              {form.submitButton}
            </Inline>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent tone="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard secret?</AlertDialogTitle>
            <AlertDialogDescription>
              The secret and options you entered will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDiscarding(false);
                close();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const REQUEST_BLANK = {
  name: "",
  expiresIn: "7d",
  accessType: SecretSharingAccessType.Organization
};

export const RequestSecretDialog = ({
  open,
  onOpenChange,
  subOrganization
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subOrganization?: string;
}) => {
  const formId = useId();
  const create = useV4Adapter("secretSharing").useCreateSecretRequest();
  const [form, setForm] = useState(REQUEST_BLANK);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ url: string; expiresAt: string }>();
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setForm(REQUEST_BLANK);
      setResult(undefined);
    }
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Request a secret</DialogTitle>
          {!result && (
            <DialogDescription>
              Create a link that lets someone send you a secret without exposing it over chat or
              email.
            </DialogDescription>
          )}
        </DialogHeader>
        {result ? (
          <LinkResult
            title="Request link created"
            description="Send this link to whoever holds the secret. The value they submit is encrypted and only visible to your organization."
            url={result.url}
            meta={[{ icon: "calendar", label: `Accepts a secret until ${result.expiresAt}` }]}
          />
        ) : (
          <form
            id={formId}
            noValidate
            className={styles.form}
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              try {
                const { id } = await create.mutateAsync({
                  name: form.name || undefined,
                  accessType: form.accessType,
                  expiresIn: form.expiresIn
                });
                const url = secretRequestLink(id, subOrganization);
                setResult({ url, expiresAt: formatExpiry(form.expiresIn) });
                setForm(REQUEST_BLANK);
                await writeLink(url, {
                  copied: "Secret request link copied to clipboard",
                  blocked:
                    "Request link created. Copy it below, your browser blocked clipboard access."
                });
              } catch (error) {
                toast({
                  tone: "bad",
                  title: "Could not create the request link",
                  description: error instanceof Error ? error.message : undefined
                });
              } finally {
                setPending(false);
              }
            }}
          >
            <Field
              label="Name"
              optional
              description="Visible only to your organization, not the sender."
            >
              <Input
                value={form.name}
                placeholder="API Key"
                autoComplete="off"
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field
              label="Expires in"
              description={`The link stops accepting a secret on ${formatExpiry(form.expiresIn)}. A secret submitted before then stays available to you.`}
            >
              <Select
                value={form.expiresIn}
                options={EXPIRES_IN_OPTIONS}
                onChange={(expiresIn) => setForm({ ...form, expiresIn })}
              />
            </Field>
            <Field
              label="Who can respond"
              description="Restricting to your organization requires the sender to sign in to Infisical."
            >
              <Select
                value={form.accessType}
                options={[
                  { value: SecretSharingAccessType.Anyone, label: "Anyone" },
                  {
                    value: SecretSharingAccessType.Organization,
                    label: "People within your organization"
                  }
                ]}
                onChange={(accessType) =>
                  setForm({ ...form, accessType: accessType as SecretSharingAccessType })
                }
              />
            </Field>
          </form>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={() => setResult(undefined)}>Request another secret</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" form={formId} loading={pending}>
                Create request link
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
