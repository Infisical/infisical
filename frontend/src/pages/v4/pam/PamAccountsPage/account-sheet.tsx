import { type ReactNode, useMemo, useState, useRef } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field, FieldSet } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { type DataListItem, DataList } from "@infisical/cipher/ui/list";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { Text } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";

import {
  PamAccountAccessibilityIssue,
  PamFieldWidget,
  PamResourcePermissionActions,
  type TPamAccount,
  type TPamAccountTypeMetadata,
  type TPamFieldDescriptor
} from "@app/hooks/api/pam";
import { PamSheetTab, usePamSheetState } from "@app/hooks/usePamSheetState";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { useOrgId } from "../../access/permissions";
import { errorMessage, failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import type { PamAdapter } from "../../data/pam/contract";
import { orgHref, useGo } from "../../links";
import {
  applyForcedRules,
  buildEditCredentialValues,
  buildEditFieldValues,
  filterUnchangedCredentials,
  knownFieldsFor,
  missingFieldErrors,
  omitUnsetAbsentFields,
  REQUIRED,
  serverFieldErrors,
  type TFieldErrors,
  type TFieldGroup,
  type TFieldValues
} from "./account-form";
import { CredentialHealth, OverridesPanel, RotationPanel } from "./account-settings";
import { MembersPanel } from "./members";
import { SchemaFields } from "./schema-fields";
import { visibleAccountTabs } from "./sheet-tabs";
import { SshCaNotice } from "./ssh-ca-notice";

const ISSUE_TAB: Record<PamAccountAccessibilityIssue, PamSheetTab> = {
  [PamAccountAccessibilityIssue.NoCredential]: PamSheetTab.Configuration,
  [PamAccountAccessibilityIssue.NoGateway]: PamSheetTab.Advanced,
  [PamAccountAccessibilityIssue.NoRecordingConfig]: PamSheetTab.Advanced,
  [PamAccountAccessibilityIssue.NoApprovalConfig]: PamSheetTab.Configuration
};

const tabsWithIssues = (account: TPamAccount) =>
  new Set(account.accessibilityIssues.map((issue) => ISSUE_TAB[issue]));

type Draft = {
  name: string;
  description: string;
  folderId: string;
  templateId: string;
  values: TFieldValues;
};

const draftOf = (account: TPamAccount, metadata: TPamAccountTypeMetadata): Draft => ({
  name: account.name,
  description: account.description ?? "",
  folderId: account.folderId,
  templateId: account.templateId,
  values: {
    connectionDetails: buildEditFieldValues(metadata.connectionFields, account.connectionDetails),
    credentials: buildEditCredentialValues(metadata.credentialFields, account.credentials)
  }
});

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

const fieldValue = (field: TPamFieldDescriptor, value: unknown) => {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (field.widget === PamFieldWidget.Textarea) return <Badge tone="ok">Configured</Badge>;
  return <MiddleTruncate text={String(value)} mono />;
};

const AccountForm = ({
  account,
  metadata,
  lead,
  update,
  canCheckHealth,
  onDirtyChange
}: {
  account: TPamAccount;
  metadata: TPamAccountTypeMetadata;
  lead: ReactNode;
  canCheckHealth: boolean;
  update: ReturnType<PamAdapter["useUpdateAccount"]>;
  onDirtyChange: (dirty: boolean) => void;
}) => {
  const pam = useV4Adapter("pam");
  const { data: folders = [] } = pam.useFolders();
  const { data: templates = [] } = pam.useTemplates({ type: account.accountType });
  const initial = useMemo(() => draftOf(account, metadata), [account, metadata]);
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<TFieldErrors>({});
  const pending = update.isPending;
  const dirty = !sameDraft(draft, initial);

  const setDirtyDraft = (next: Draft) => {
    setDraft(next);
    onDirtyChange(!sameDraft(next, initial));
  };

  const templateOptions = templates.map(({ id, name }) => ({ value: id, label: name }));
  if (!templateOptions.some(({ value }) => value === account.templateId))
    templateOptions.unshift({ value: account.templateId, label: account.templateName });

  const changeField = (group: TFieldGroup) => (key: string, value: unknown) => {
    setDirtyDraft({
      ...draft,
      values: applyForcedRules(metadata, {
        ...draft.values,
        [group]: { ...draft.values[group], [key]: value }
      })
    });
    setErrors((current) => ({ ...current, [`${group}.${key}`]: "" }));
  };

  const submit = async () => {
    const nextErrors = missingFieldErrors(metadata, draft.values);
    if (!draft.name.trim()) nextErrors.name = REQUIRED;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return false;
    const credentials = filterUnchangedCredentials(draft.values.credentials);
    try {
      await update.mutateAsync({
        accountId: account.id,
        accountType: account.accountType,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        folderId: draft.folderId,
        templateId: draft.templateId,
        connectionDetails: omitUnsetAbsentFields(
          draft.values.connectionDetails,
          account.connectionDetails
        ),
        ...(credentials ? { credentials } : {})
      });
      saved("Account updated");
      onDirtyChange(false);
      return true;
    } catch (error) {
      const { fields, unmapped } = serverFieldErrors(error, knownFieldsFor(metadata));
      setErrors(fields);
      if (unmapped.length || !Object.keys(fields).length)
        failed(
          "Failed to update account",
          unmapped.length ? new Error(unmapped.join(", ")) : error
        );
      return false;
    }
  };

  return (
    <>
      <SheetBody>
        {lead}
        <form
          id="pam-account-configure"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={24}>
            <FieldSet legend="General">
              <Stack gap={16}>
                <Field label="Name" error={errors.name}>
                  <Input
                    autoComplete="off"
                    value={draft.name}
                    invalid={Boolean(errors.name)}
                    onChange={(event) => {
                      setDirtyDraft({ ...draft, name: event.target.value });
                      setErrors((current) => ({ ...current, name: "" }));
                    }}
                  />
                </Field>
                <Field label="Description" optional>
                  <Textarea
                    rows={2}
                    value={draft.description}
                    onChange={(event) =>
                      setDirtyDraft({ ...draft, description: event.target.value })
                    }
                  />
                </Field>
                <Field label="Folder" error={errors.folderId}>
                  <Select
                    label="Folder"
                    value={draft.folderId}
                    options={folders.map(({ id, name }) => ({ value: id, label: name }))}
                    onChange={(folderId) => setDirtyDraft({ ...draft, folderId })}
                  />
                </Field>
                <Field label="Template" error={errors.templateId}>
                  <Select
                    label="Template"
                    value={draft.templateId}
                    options={templateOptions}
                    onChange={(templateId) => setDirtyDraft({ ...draft, templateId })}
                  />
                </Field>
              </Stack>
            </FieldSet>
            <FieldSet legend="Connection details">
              <SchemaFields
                group="connectionDetails"
                metadata={metadata}
                values={draft.values}
                errors={errors}
                onChange={changeField("connectionDetails")}
                onPasteValues={(values) =>
                  setDirtyDraft({ ...draft, values: applyForcedRules(metadata, values) })
                }
              />
            </FieldSet>
            {metadata.credentialFields.length > 0 && (
              <FieldSet legend="Credentials">
                <Stack gap={16}>
                  <SchemaFields
                    group="credentials"
                    metadata={metadata}
                    values={draft.values}
                    errors={errors}
                    keepsSecrets
                    onChange={changeField("credentials")}
                  />
                  <SshCaNotice
                    accountType={account.accountType}
                    authMethod={draft.values.credentials.authMethod as string | undefined}
                    accountId={account.id}
                  />
                  <CredentialHealth
                    accountId={account.id}
                    canCheck={canCheckHealth}
                    onBeforeCheck={async () => !dirty || submit()}
                  />
                </Stack>
              </FieldSet>
            )}
          </Stack>
        </form>
      </SheetBody>
      <SheetFooter>
        <Inline gap={8} justify="end">
          <Button
            variant="outline"
            disabled={!dirty || pending}
            onClick={() => {
              setDraft(initial);
              setErrors({});
              onDirtyChange(false);
            }}
          >
            Discard
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="pam-account-configure"
            loading={pending}
            disabledReason={dirty ? undefined : "No changes to save"}
          >
            Save
          </Button>
        </Inline>
      </SheetFooter>
    </>
  );
};

export const AccountSheet = ({
  accountId,
  onOpenChange
}: {
  accountId?: string;
  onOpenChange: (open: boolean) => void;
}) => {
  const orgId = useOrgId();
  const go = useGo();
  const pam = useV4Adapter("pam");
  const { tab, setTab } = usePamSheetState("accountId");
  const { data: account, isPending, error } = pam.useAccount(accountId);
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const { can } = pam.useAccountActions(accountId ?? "", Boolean(accountId));
  const update = pam.useUpdateAccount();
  const [dirty, setDirty] = useState(false);
  const metadata = accountTypes.find(({ type }) => type === account?.accountType);

  const close = () => {
    setDirty(false);
    onOpenChange(false);
  };
  const pendingTab = useRef<string | null>(null);
  const guard = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: () => {
      const nextTab = pendingTab.current;
      pendingTab.current = null;
      if (!nextTab) {
        close();
        return;
      }
      setDirty(false);
      setTab(nextTab);
    }
  });
  const requestClose = () => {
    pendingTab.current = null;
    guard.requestDiscard();
  };

  const tabs = account
    ? visibleAccountTabs(can, account.accountType).map((definition) => ({
        value: definition.value,
        label: tabsWithIssues(account).has(definition.value) ? (
          <Inline gap={8} align="center" wrap={false}>
            {definition.label}
            <Badge tone="warn" dot size="sm">
              Needs setup
            </Badge>
          </Inline>
        ) : (
          definition.label
        )
      }))
    : [];
  const activeTab = tabs.find(({ value }) => value === tab)?.value ?? tabs[0]?.value;

  const summary: DataListItem[] = account
    ? [
        [
          "Template",
          <Link
            key="template"
            {...go.link(orgHref(orgId, `/pam/templates?templateId=${account.templateId}`))}
          >
            {account.templateName}
          </Link>
        ],
        ...(metadata?.connectionFields ?? [])
          .filter(
            (field) =>
              !field.secret &&
              account.connectionDetails[field.key] !== undefined &&
              account.connectionDetails[field.key] !== null &&
              account.connectionDetails[field.key] !== ""
          )
          .map((field): DataListItem => [
            field.label,
            fieldValue(field, account.connectionDetails[field.key])
          ]),
        ...(account.credentials.username
          ? [
              [
                "Username",
                <MiddleTruncate key="username" text={String(account.credentials.username)} mono />
              ] as DataListItem
            ]
          : []),
        ["Created", format(new Date(account.createdAt), "MMMM do, yyyy")]
      ]
    : [];

  const lead = account && (
    <Stack gap={16}>
      {account.description && <Text muted>{account.description}</Text>}
      <DataList variant="props" items={summary} />
      {activeTab && (
        <Tabs
          label="Account sections"
          value={activeTab}
          tabs={tabs}
          onChange={(next) => {
            if (dirty) {
              pendingTab.current = next;
              guard.requestDiscard();
              return;
            }
            setTab(next);
          }}
        />
      )}
    </Stack>
  );

  let body = (
    <SheetBody>
      <Stack gap={12}>
        <Skeleton height={24} />
        <Skeleton height={120} />
      </Stack>
    </SheetBody>
  );
  if (!account && error)
    body = (
      <SheetBody>
        <EmptyState
          size="sm"
          icon="alert"
          title="Could not load this account"
          description={errorMessage(error) || "Please try again."}
        />
      </SheetBody>
    );
  if (!isPending && account && metadata) {
    body = <SheetBody>{lead}</SheetBody>;
    if (activeTab === PamSheetTab.Configuration)
      body = (
        <AccountForm
          key={`${account.id}-${account.updatedAt}`}
          account={account}
          metadata={metadata}
          lead={<Stack gap={24}>{lead}</Stack>}
          update={update}
          canCheckHealth={can(PamResourcePermissionActions.ViewCredentials)}
          onDirtyChange={setDirty}
        />
      );
    if (activeTab === PamSheetTab.Permissions)
      body = (
        <SheetBody>
          <Stack gap={24}>
            {lead}
            <MembersPanel
              scope="account"
              resourceId={account.id}
              inheritFrom={{ folderId: account.folderId, folderName: account.folderName }}
            />
          </Stack>
        </SheetBody>
      );
    if (activeTab === PamSheetTab.Rotation)
      body = (
        <SheetBody>
          <Stack gap={24}>
            {lead}
            <RotationPanel accountId={account.id} metadata={metadata} />
          </Stack>
        </SheetBody>
      );
    if (activeTab === PamSheetTab.Advanced)
      body = (
        <SheetBody>
          <Stack gap={24}>
            {lead}
            <OverridesPanel
              key={account.id}
              account={account}
              metadata={metadata}
              onDirtyChange={setDirty}
            />
          </Stack>
        </SheetBody>
      );
  }

  return (
    <>
      <Sheet
        open={Boolean(accountId)}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <SheetContent size="lg" pending={update.isPending}>
          <SheetHeader>
            <Inline gap={12} align="center" wrap={false}>
              {metadata && <ProviderIcon icon={metadata.icon} alt={metadata.name} size="md" />}
              <Stack gap={4}>
                <Inline gap={8} align="center">
                  <SheetTitle>{account?.name ?? "Account"}</SheetTitle>
                  {metadata && <Badge tone="outline">{metadata.name}</Badge>}
                  {account?.isStale && <Badge tone="soft">Stale</Badge>}
                </Inline>
                {account?.folderName && <SheetDescription>{account.folderName}</SheetDescription>}
              </Stack>
            </Inline>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="Your unsaved account changes will be lost."
      />
    </>
  );
};
