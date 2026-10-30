import { type ReactNode, useState } from "react";
import { BanIcon, PencilIcon, UserRoundXIcon } from "lucide-react";

import { Alert } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { Switch } from "@app/components/v4/ui/switch";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { useAccess } from "../context";
import { authMethodNames, type OrgIdentity } from "../model";
import { Gate, Muted, useCan } from "../ui";
import { ProjectIdentityAuthSection } from "./identity-auth";
import {
  ASSUME_HINT,
  AssumePrivilegesDialog,
  DELETE_PROTECTED,
  IdentityRemovalDialog,
  ManagedByBadge,
  projectIdentityRows
} from "./identity-common";
import { IdentityRoleDetailsSection } from "./identity-roles";

import styles from "./identity.module.css";

type MetadataDraft = { key: string; value: string; id: string };

const EditIdentityDialog = ({
  identity,
  open,
  onOpenChange
}: {
  identity: OrgIdentity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { update, saved } = useAccess();
  const [name, setName] = useState(identity.name);
  const [protection, setProtection] = useState(identity.hasDeleteProtection);
  const [metadata, setMetadata] = useState<MetadataDraft[]>(() =>
    identity.metadata.map((entry) => ({ ...entry, id: crypto.randomUUID() }))
  );
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const setEntry = (id: string, patch: Partial<MetadataDraft>) =>
    setMetadata((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );
  const invalid =
    !name.trim() || metadata.some((entry) => !entry.key.trim() || !entry.value.trim());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project identity</DialogTitle>
          <DialogDescription>
            Update the identity&apos;s name, delete protection, and metadata.
          </DialogDescription>
        </DialogHeader>
        <form
          id="edit-project-identity"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (invalid) return;
            setPending(true);
            window.setTimeout(() => {
              update((current) => ({
                ...current,
                orgIdentities: current.orgIdentities.map((item) =>
                  item.id === identity.id
                    ? {
                        ...item,
                        name: name.trim(),
                        hasDeleteProtection: protection,
                        metadata: metadata.map(({ key, value }) => ({
                          key: key.trim(),
                          value: value.trim()
                        }))
                      }
                    : item
                )
              }));
              setPending(false);
              onOpenChange(false);
              saved("Successfully updated machine identity");
            }, 500);
          }}
        >
          <Stack gap={16}>
            <Field label="Name" error={submitted && !name.trim() ? "Required" : undefined}>
              <Input
                autoFocus
                placeholder="Machine 1"
                autoComplete="off"
                name="project-identity-name"
                value={name}
                invalid={submitted && !name.trim()}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Switch
              label="Delete protection"
              description="Prevents this identity from being deleted while enabled."
              checked={protection}
              onChange={setProtection}
            />
            <Stack gap={8}>
              <span className={styles.sectionLabel}>Metadata</span>
              <div className={styles.metadataBox} data-empty={metadata.length ? undefined : ""}>
                {metadata.length === 0
                  ? "No metadata entries. Select add entry below to add one."
                  : metadata.map((entry, index) => (
                      <div key={entry.id} className={styles.metadataRow}>
                        <div className={styles.metadataField}>
                          <Field
                            label={index === 0 ? "Key" : undefined}
                            error={submitted && !entry.key.trim() ? "Required" : undefined}
                          >
                            <Input
                              aria-label="Key"
                              value={entry.key}
                              invalid={submitted && !entry.key.trim()}
                              onChange={(event) => setEntry(entry.id, { key: event.target.value })}
                            />
                          </Field>
                        </div>
                        <div className={styles.metadataField}>
                          <Field
                            label={index === 0 ? "Value" : undefined}
                            error={submitted && !entry.value.trim() ? "Required" : undefined}
                          >
                            <Input
                              aria-label="Value"
                              value={entry.value}
                              invalid={submitted && !entry.value.trim()}
                              onChange={(event) =>
                                setEntry(entry.id, { value: event.target.value })
                              }
                            />
                          </Field>
                        </div>
                        <div className={styles.metadataRemove}>
                          <Button
                            variant="danger-ghost"
                            icon="trash"
                            iconOnly
                            onClick={() =>
                              setMetadata((current) =>
                                current.filter((item) => item.id !== entry.id)
                              )
                            }
                          >
                            Remove metadata entry
                          </Button>
                        </div>
                      </div>
                    ))}
              </div>
              <div>
                <Button
                  variant="ghost"
                  size="xs"
                  icon="plus"
                  onClick={() =>
                    setMetadata((current) => [
                      ...current,
                      { key: "", value: "", id: crypto.randomUUID() }
                    ])
                  }
                >
                  Add entry
                </Button>
              </div>
            </Stack>
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="edit-project-identity" loading={pending}>
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CopyIdButton = ({ id }: { id: string }) => {
  const [copied, setCopied] = useState(false);
  const label = copied ? "Machine identity ID copied" : "Copy machine identity ID";
  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="icon-xs"
        icon={copied ? "check" : "copy"}
        iconOnly
        onClick={() => {
          navigator.clipboard?.writeText(id).catch(() => undefined);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }}
      >
        {label}
      </Button>
    </Tooltip>
  );
};

const DetailsCard = ({
  identity,
  createdAt,
  onEdit
}: {
  identity: OrgIdentity;
  createdAt: string;
  onEdit: () => void;
}) => {
  const can = useCan("project");
  const isOrgIdentity = !identity.managedByProject;
  const lastMethod = identity.lastLogin ? identity.authMethods[0] : undefined;
  return (
    <Card
      title="Details"
      description="Machine identity details"
      action={
        isOrgIdentity ? undefined : (
          <Gate allowed={can("identity", "edit")}>
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="Edit machine identity"
              disabled={!can("identity", "edit")}
              onClick={onEdit}
            >
              <Icon icon={PencilIcon} size={12} />
            </Button>
          </Gate>
        )
      }
    >
      <DataList
        variant="props"
        items={[
          ["Name", identity.name],
          [
            "ID",
            <span key="id" className={styles.idValue}>
              <code>{identity.id}</code>
              <CopyIdButton id={identity.id} />
            </span>
          ],
          ["Managed by", <ManagedByBadge key="managed" identity={identity} />],
          [
            "Metadata",
            identity.metadata.length ? (
              <span key="metadata" className={styles.pairs}>
                {identity.metadata.map((entry) => (
                  <span key={entry.key} className={styles.pair}>
                    <Badge tone="soft" mono>
                      {entry.key}
                    </Badge>
                    <Badge tone="outline" mono>
                      {entry.value}
                    </Badge>
                  </span>
                ))}
              </span>
            ) : (
              <Muted key="metadata">-</Muted>
            )
          ],
          [isOrgIdentity ? "Joined project" : "Created", createdAt],
          ...(isOrgIdentity
            ? []
            : ([
                [
                  "Last login method",
                  lastMethod ? authMethodNames[lastMethod] : <Muted key="method">-</Muted>
                ],
                ["Last logged in", identity.lastLogin ?? <Muted key="login">-</Muted>],
                [
                  "Delete protection",
                  identity.hasDeleteProtection ? (
                    <Badge key="protection" tone="ok">
                      <Icon name="check" size={12} />
                      Enabled
                    </Badge>
                  ) : (
                    <Badge key="protection" tone="outline">
                      <Icon icon={BanIcon} size={12} />
                      Disabled
                    </Badge>
                  )
                ]
              ] as [string, ReactNode][]))
        ]}
      />
    </Card>
  );
};

const OrgManagedAuthCard = ({ identity }: { identity: OrgIdentity }) => {
  const { navigate } = useAccess();
  const canOrg = useCan("org");
  return (
    <Card title="Authentication" description="Configure authentication methods">
      <Alert tone="info" title="Machine identity managed by organization">
        This machine identity&apos;s authentication methods are managed by your organization.
        {canOrg("identity", "read") && (
          <>
            {" To make changes, "}
            <Button
              variant="link"
              onClick={() =>
                navigate({
                  scope: "org",
                  detail: {
                    kind: "org-identity",
                    id: identity.id,
                    label: identity.name,
                    mono: true
                  }
                })
              }
            >
              go to organization access control
            </Button>
          </>
        )}
        .
      </Alert>
    </Card>
  );
};

const DetailSkeleton = () => (
  <Stack gap={24} aria-busy>
    <Stack gap={12}>
      <Skeleton width={180} height={16} />
      <Skeleton width={260} height={28} />
      <Skeleton width={360} height={14} />
    </Stack>
    <div className={styles.detailGrid}>
      <Skeleton height={360} />
      <Stack gap={24}>
        <Skeleton height={160} />
        <Skeleton height={200} />
      </Stack>
    </div>
  </Stack>
);

export const ProjectIdentityDetail = ({ id }: { id: string }) => {
  const { data, loading, navigate, toast } = useAccess();
  const can = useCan("project");
  const row = projectIdentityRows(data).find((item) => item.identity.id === id);
  const [editing, setEditing] = useState(false);
  const [assuming, setAssuming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const back = () => navigate({ scope: "project", projectTab: "identities" });

  if (loading) return <DetailSkeleton />;

  const backLink = (
    <div>
      <Button variant="link" icon="chev-left" onClick={back}>
        Project machine identities
      </Button>
    </div>
  );

  if (!row)
    return (
      <Stack gap={24}>
        {backLink}
        <EmptyState
          icon="search"
          title="Machine identity not found"
          description="The machine identity may have been removed or you may not have access to it."
        />
      </Stack>
    );

  const { identity, membership } = row;
  const isProjectIdentity = Boolean(identity.managedByProject);
  const deleteBlocked = isProjectIdentity && identity.hasDeleteProtection;

  return (
    <Stack gap={24}>
      <Stack gap={12}>
        {backLink}
        <PageHeader
          title={identity.name}
          mono
          description={`Configure and manage${isProjectIdentity ? " machine identity and " : " "}project access control`}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" iconRight="more">
                  Options
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard?.writeText(identity.id).catch(() => undefined);
                    toast({ tone: "neutral", title: "Machine identity ID copied to clipboard" });
                  }}
                >
                  <Icon name="copy" />
                  Copy machine identity ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!can("identity", "edit")}
                  description={ASSUME_HINT}
                  onSelect={() => setAssuming(true)}
                >
                  <Icon name="user" />
                  Assume privileges
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!can("identity", "delete") || deleteBlocked}
                  description={deleteBlocked ? DELETE_PROTECTED : undefined}
                  onSelect={() => setRemoving(true)}
                >
                  {isProjectIdentity ? <Icon name="trash" /> : <Icon icon={UserRoundXIcon} />}
                  {isProjectIdentity ? "Delete machine identity" : "Remove from project"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </Stack>
      <div className={styles.detailGrid}>
        <DetailsCard
          identity={identity}
          createdAt={membership.createdAt}
          onEdit={() => setEditing(true)}
        />
        <Stack gap={24}>
          {isProjectIdentity ? (
            <ProjectIdentityAuthSection identity={identity} />
          ) : (
            <OrgManagedAuthCard identity={identity} />
          )}
          <IdentityRoleDetailsSection membership={membership} />
        </Stack>
      </div>
      {editing && (
        <EditIdentityDialog identity={identity} open={editing} onOpenChange={setEditing} />
      )}
      <AssumePrivilegesDialog open={assuming} onOpenChange={setAssuming} />
      <IdentityRemovalDialog
        row={removing ? row : undefined}
        from="detail"
        onOpenChange={setRemoving}
        onDone={back}
      />
    </Stack>
  );
};
