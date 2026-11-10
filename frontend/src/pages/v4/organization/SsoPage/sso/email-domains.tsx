import { useId, useState } from "react";
import { format } from "date-fns";
import { ShieldCheckIcon } from "lucide-react";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v4/ui/alert";
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
import { Badge, type BadgeTone } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { Detail, DetailGroup, DetailLabel, DetailValue } from "@app/components/v4/ui/detail";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Snippet } from "@app/components/v4/ui/snippet";
import {
  OrgPermissionEmailDomainActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type { TEmailDomain } from "@app/hooks/api/emailDomains/types";

import { useOrgId, useOrgPermission } from "../../../access/permissions";
import { failed, saved, toast } from "../../../access/toast";
import { AccessRestricted, ListToolbar, RESTRICTED } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";

const addDomainFormSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Domain is required")
    .refine((val) => val.includes(".") && !val.startsWith(".") && !val.endsWith("."), {
      message: "Please provide a valid domain name (e.g., company.com)"
    })
});

const STATUS_BADGE: Record<TEmailDomain["status"], { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "info" },
  verified: { label: "Verified", tone: "ok" },
  expired: { label: "Expired", tone: "bad" }
};

const formatDate = (value: string) => format(new Date(value), "MMM d, yyyy");

const VerifyEmailDomainDialog = ({
  emailDomain,
  onClose
}: {
  emailDomain: TEmailDomain | null;
  onClose: () => void;
}) => {
  const verifyDomain = useV4Adapter("sso").useVerifyEmailDomain();
  const [pending, setPending] = useState(false);
  const txtValue = `infisical-domain-verification=${emailDomain?.verificationCode ?? ""}`;
  const copied = () => toast({ tone: "neutral", title: "Copied to clipboard" });

  const handleVerify = async () => {
    if (!emailDomain) return;
    setPending(true);
    try {
      await verifyDomain.mutateAsync({ emailDomainId: emailDomain.id });
      saved("Domain verified successfully!");
      onClose();
    } catch (error) {
      failed("Failed to verify domain. Please check your DNS records and try again.", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={Boolean(emailDomain)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Verify email domain</DialogTitle>
          <DialogDescription>
            Add the following DNS TXT record to verify ownership of {emailDomain?.domain ?? ""}.
          </DialogDescription>
        </DialogHeader>
        <Stack gap={16}>
          <DetailGroup>
            <Detail>
              <DetailLabel>Record type</DetailLabel>
              <DetailValue>
                <Badge mono>TXT</Badge>
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Record name</DetailLabel>
              <DetailValue>
                <Snippet
                  label="Record name"
                  copyLabel="Copy record name"
                  value={emailDomain?.verificationRecordName ?? ""}
                  onCopy={copied}
                />
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Record value</DetailLabel>
              <DetailValue>
                <Snippet
                  label="Record value"
                  copyLabel="Copy record value"
                  value={txtValue}
                  onCopy={copied}
                />
              </DetailValue>
            </Detail>
          </DetailGroup>
          <Alert tone="warn">
            <AlertTitle>DNS changes can take up to 48 hours to propagate</AlertTitle>
            <AlertDescription>
              Most updates propagate within minutes. The verification code expires 7 days after
              creation.
            </AlertDescription>
          </Alert>
        </Stack>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button loading={pending} onClick={handleVerify}>
            Verify domain
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const AddEmailDomainDialog = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const createEmailDomain = useV4Adapter("sso").useCreateEmailDomain();
  const formId = useId();
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState<TEmailDomain | null>(null);

  const reset = () => {
    setDomain("");
    setError(undefined);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          reset();
        }}
      >
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>Add email domain</DialogTitle>
            <DialogDescription>Add a domain to verify ownership via DNS.</DialogDescription>
          </DialogHeader>
          <form
            id={formId}
            noValidate
            onSubmit={async (event) => {
              event.preventDefault();
              const parsed = addDomainFormSchema.safeParse({ domain });
              if (!parsed.success) {
                setError(parsed.error.issues[0]?.message);
                return;
              }
              setPending(true);
              try {
                const emailDomain = await createEmailDomain.mutateAsync({
                  domain: parsed.data.domain
                });
                saved("Email domain added. Follow the DNS verification steps to complete setup.");
                onOpenChange(false);
                reset();
                setVerifying(emailDomain);
              } catch (cause) {
                failed("Failed to add email domain", cause);
              } finally {
                setPending(false);
              }
            }}
          >
            <Field label="Domain" error={error}>
              <Input
                mono
                autoComplete="off"
                placeholder="company.com"
                value={domain}
                invalid={Boolean(error)}
                onChange={(event) => setDomain(event.target.value)}
              />
            </Field>
          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" form={formId} loading={pending}>
              Add domain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <VerifyEmailDomainDialog emailDomain={verifying} onClose={() => setVerifying(null)} />
    </>
  );
};

const EmailDomainsTable = ({
  search,
  onVerify
}: {
  search: string;
  onVerify: (emailDomain: TEmailDomain) => void;
}) => {
  const orgId = useOrgId();
  const sso = useV4Adapter("sso");
  const { permission } = useOrgPermission();
  const { data: emailDomains = [], isPending } = sso.useEmailDomains(orgId);
  const deleteEmailDomain = sso.useDeleteEmailDomain();
  const [removing, setRemoving] = useState<TEmailDomain | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const canVerify = permission.can(
    OrgPermissionEmailDomainActions.VerifyDomain,
    OrgPermissionSubjects.EmailDomains
  );
  const canDelete = permission.can(
    OrgPermissionEmailDomainActions.Delete,
    OrgPermissionSubjects.EmailDomains
  );

  const needle = search.toLowerCase();
  const rows = emailDomains.filter(({ domain }) => domain.toLowerCase().includes(needle));

  const columns: DataTableColumn<TEmailDomain>[] = [
    {
      id: "domain",
      header: "Domain",
      primary: true,
      grow: true,
      mono: true,
      text: (row) => row.domain,
      render: (row) => row.domain
    },
    {
      id: "status",
      header: "Status",
      width: 210,
      render: (row) => {
        const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.pending;
        return (
          <Inline gap={8} wrap={false}>
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {row.status === "pending" && canVerify && (
              <Button variant="link" size="xs" underline="hover" onClick={() => onVerify(row)}>
                Verify domain
              </Button>
            )}
          </Inline>
        );
      }
    },
    {
      id: "verifiedAt",
      header: "Verified at",
      width: 130,
      render: (row) => (row.verifiedAt ? formatDate(row.verifiedAt) : "None")
    },
    {
      id: "expiresAt",
      header: "Expires at",
      width: 130,
      render: (row) => (row.status === "pending" ? formatDate(row.codeExpiresAt) : "None")
    }
  ];

  const handleRemove = async () => {
    if (!removing) return;
    setRemovePending(true);
    try {
      await deleteEmailDomain.mutateAsync({ emailDomainId: removing.id });
      saved("Successfully removed email domain");
      setRemoving(null);
    } catch (error) {
      failed("Failed to remove email domain", error);
    } finally {
      setRemovePending(false);
    }
  };

  return (
    <>
      {isPending || rows.length > 0 ? (
        <DataTable
          label="Email domains"
          rows={rows}
          columns={columns}
          loading={isPending}
          loadingRows={3}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.domain}
          rowActions={{
            renderMenu: (row) => (
              <>
                {row.status === "pending" && (
                  <DropdownMenuItem
                    disabled={!canVerify}
                    description={canVerify ? undefined : RESTRICTED}
                    onSelect={() => onVerify(row)}
                  >
                    <Icon icon={ShieldCheckIcon} />
                    Verify
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canDelete}
                  description={canDelete ? undefined : RESTRICTED}
                  onSelect={() => setRemoving(row)}
                >
                  <Icon name="trash" />
                  Delete
                </DropdownMenuItem>
              </>
            )
          }}
        />
      ) : (
        <EmptyState
          size="sm"
          icon={emailDomains.length ? "search" : "globe"}
          title="No email domains found"
          description="Add an email domain to set up your IdP."
        />
      )}
      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent tone="danger" pending={removePending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove domain &quot;{removing?.domain}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the domain from your organization. Any SSO login associated with this
              domain will no longer work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                handleRemove();
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const EmailDomainsSection = () => {
  const orgId = useOrgId();
  const { permission } = useOrgPermission();
  const { data: subscription } = useV4Adapter("sso").useSubscription(orgId);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState<TEmailDomain | null>(null);

  const hasEmailDomainVerification = Boolean(subscription?.emailDomainVerification);
  const canRead = permission.can(
    OrgPermissionEmailDomainActions.Read,
    OrgPermissionSubjects.EmailDomains
  );
  const canCreate = permission.can(
    OrgPermissionEmailDomainActions.Create,
    OrgPermissionSubjects.EmailDomains
  );

  const renderBody = () => {
    if (!hasEmailDomainVerification) {
      return (
        <EmptyState
          size="sm"
          icon="lock"
          title="Your current plan does not include email domain verification."
          description="Upgrade your plan to verify email domains for SSO and identity provider enforcement."
        />
      );
    }
    if (!canRead) return <AccessRestricted />;
    return <EmailDomainsTable search={search} onVerify={setVerifying} />;
  };

  return (
    <>
      <Card
        variant="framed"
        title="Email domains"
        description="Verified domains for your IdP."
        flush={hasEmailDomainVerification && canRead}
        action={
          <Inline gap={8} wrap={false}>
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/email-domain" />
            {hasEmailDomainVerification && canRead && (
              <ListToolbar band search={search} onSearch={setSearch} placeholder="Search domains" />
            )}
            {hasEmailDomainVerification && (
              <Button
                variant="outline"
                size="xs"
                icon="plus"
                disabledReason={canCreate ? undefined : RESTRICTED}
                onClick={() => setAdding(true)}
              >
                Add domain
              </Button>
            )}
          </Inline>
        }
      >
        {renderBody()}
      </Card>
      <AddEmailDomainDialog open={adding} onOpenChange={setAdding} />
      <VerifyEmailDomainDialog emailDomain={verifying} onClose={() => setVerifying(null)} />
    </>
  );
};
