import { ReactNode, useEffect, useState } from "react";
import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { CodeEditor } from "@app/components/v3/generic/CodeEditor";
import { cn } from "@app/components/v3/utils";
import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { AddPoliciesPopover } from "./AddPoliciesPopover";
import {
  clearPermissionRow,
  getPolicyWarning,
  isRowEmpty,
  PERMISSION_ROWS,
  TAgentVaultPolicy,
  TPermissionRowKey,
  TPolicyKind,
  TUnsupportedRule
} from "./agentVaultPolicyModel";
import { CapabilitiesCard } from "./CapabilitiesCard";
import {
  AccessBundlesAccessCard,
  ServicesAccessCard,
  SkillsAccessCard
} from "./ResourceAccessCard";

export type TPolicyEditorTab = "visual" | "json";

const REASONS_SHOWN = 4;

const UnsupportedRulesAlert = ({
  noun,
  unsupported,
  canEdit
}: {
  noun: TPolicyKind;
  unsupported: TUnsupportedRule[];
  canEdit: boolean;
}) => {
  const reasons = [...new Set(unsupported.map(({ reason }) => reason))];

  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>Some permissions can&apos;t be shown in the visual editor</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col gap-1.5">
          <p>
            {canEdit
              ? `Edit this ${noun} on the JSON tab so nothing it holds is lost. The visual editor stays read-only until every rule fits it.`
              : `The JSON tab shows every rule this ${noun} holds.`}
          </p>
          <ul className="list-disc pl-4">
            {reasons.slice(0, REASONS_SHOWN).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            {reasons.length > REASONS_SHOWN && <li>And {reasons.length - REASONS_SHOWN} more</li>}
          </ul>
        </div>
      </AlertDescription>
    </Alert>
  );
};

type Props = {
  projectId: string;
  noun: TPolicyKind;
  policy: TAgentVaultPolicy;
  onPolicyChange: (policy: TAgentVaultPolicy) => void;
  jsonText: string;
  onJsonTextChange: (jsonText: string) => void;
  jsonError: string | null;
  unsupported: TUnsupportedRule[];
  canEdit: boolean;
  tab: TPolicyEditorTab;
  onTabChange: (tab: TPolicyEditorTab) => void;
  // Beside the editor when there is room for it, and below it otherwise or when stacked.
  aside?: ReactNode;
  layout?: "split" | "stacked";
  notice?: ReactNode;
};

export const AgentVaultPolicyEditor = ({
  projectId,
  noun,
  policy,
  onPolicyChange,
  jsonText,
  onJsonTextChange,
  jsonError,
  unsupported,
  canEdit,
  tab,
  onTabChange,
  aside,
  layout = "split",
  notice
}: Props) => {
  const isVisualReadOnly = !canEdit || Boolean(jsonError) || unsupported.length > 0;
  const isSplit = layout === "split";
  const warning = getPolicyWarning(policy, noun);
  // Scopes picked as Custom while their actions still match a level stay open, across tabs too, until a level is picked.
  const [openScopes, setOpenScopes] = useState<string[]>([]);
  // Custom scopes show their actions until collapsed, and picking Custom again shows them.
  const [collapsedScopes, setCollapsedScopes] = useState<string[]>([]);
  const toggled = (keys: string[], scopeKey: string, isIn: boolean) =>
    isIn ? [...new Set([...keys, scopeKey])] : keys.filter((key) => key !== scopeKey);
  // A row shows once it's added or once the role allows or denies anything on it, and stays until it's taken off, so
  // emptying a card from inside it doesn't make the card vanish.
  const [addedRows, setAddedRows] = useState<TPermissionRowKey[]>([]);
  useEffect(() => {
    const held = PERMISSION_ROWS.map(({ key }) => key).filter((key) => !isRowEmpty(policy, key));
    setAddedRows((prev) =>
      held.every((key) => prev.includes(key)) ? prev : [...new Set([...prev, ...held])]
    );
  }, [policy]);
  const isRowShown = (rowKey: TPermissionRowKey) =>
    addedRows.includes(rowKey) || !isRowEmpty(policy, rowKey);
  const shownRows = PERMISSION_ROWS.map(({ key }) => key).filter(isRowShown);
  const removeRow = (rowKey: TPermissionRowKey) => {
    setAddedRows((prev) => prev.filter((key) => key !== rowKey));
    onPolicyChange(clearPermissionRow(policy, rowKey));
  };
  const toggleRow = (rowKey: TPermissionRowKey) =>
    isRowShown(rowKey) ? removeRow(rowKey) : setAddedRows((prev) => [...prev, rowKey]);
  const onRemoveRow = isVisualReadOnly ? undefined : removeRow;

  const scopeProps = {
    noun,
    policy,
    onChange: onPolicyChange,
    isReadOnly: isVisualReadOnly,
    isScopeOpen: (scopeKey: string) => openScopes.includes(scopeKey),
    onScopeOpenChange: (scopeKey: string, isOpen: boolean) => {
      setOpenScopes((prev) => toggled(prev, scopeKey, isOpen));
      if (isOpen) setCollapsedScopes((prev) => toggled(prev, scopeKey, false));
    },
    isScopeCollapsed: (scopeKey: string) => collapsedScopes.includes(scopeKey),
    onScopeCollapsedChange: (scopeKey: string, isCollapsed: boolean) =>
      setCollapsedScopes((prev) => toggled(prev, scopeKey, isCollapsed))
  };

  return (
    <div
      className={cn(
        "grid items-start gap-6",
        isSplit && "dashboard:grid-cols-[minmax(0,1fr)_22rem]"
      )}
    >
      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(value as TPolicyEditorTab)}
        className="min-w-0"
      >
        {/* The tab bar's underline runs the full width, so the button sits over its right end */}
        <div className="relative">
          <TabsList variant="av" aria-label={`${noun === "role" ? "Role" : "Policy"} editor views`}>
            <TabsTrigger value="visual">Visual Editor</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>
          {tab === "visual" && !isVisualReadOnly && (
            <div className="absolute inset-y-0 right-0 flex items-center">
              <AddPoliciesPopover isRowShown={isRowShown} onToggleRow={toggleRow} />
            </div>
          )}
        </div>
        {notice}
        {unsupported.length > 0 && (
          <UnsupportedRulesAlert noun={noun} unsupported={unsupported} canEdit={canEdit} />
        )}
        <TabsContent value="visual" className="flex flex-col gap-6">
          {jsonError && (
            <Alert variant="danger">
              <CircleAlertIcon />
              <AlertTitle>The JSON can&apos;t be read</AlertTitle>
              <AlertDescription>Fix it on the JSON tab to use the visual editor.</AlertDescription>
            </Alert>
          )}
          {warning && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>Holders can&apos;t start sessions</AlertTitle>
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          )}
          {!shownRows.length && (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No policies applied</EmptyTitle>
                <EmptyDescription>
                  {isVisualReadOnly
                    ? `This ${noun} doesn't grant anything the visual editor shows.`
                    : `Add policies to set what this ${noun} grants.`}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {isRowShown("services") && (
            <ServicesAccessCard
              projectId={projectId}
              {...scopeProps}
              onRemove={onRemoveRow && (() => onRemoveRow("services"))}
            />
          )}
          {isRowShown("skills") && (
            <SkillsAccessCard
              projectId={projectId}
              {...scopeProps}
              onRemove={onRemoveRow && (() => onRemoveRow("skills"))}
            />
          )}
          {isRowShown("accessBundles") && (
            <AccessBundlesAccessCard
              projectId={projectId}
              {...scopeProps}
              onRemove={onRemoveRow && (() => onRemoveRow("accessBundles"))}
            />
          )}
          <CapabilitiesCard {...scopeProps} shownRows={shownRows} onRemoveRow={onRemoveRow} />
        </TabsContent>
        <TabsContent value="json">
          <Card>
            <CardHeader>
              <CardTitle>
                Rules
                <DocumentationLinkBadge href={AgentVaultDocsUrls.permissions} />
              </CardTitle>
              <CardDescription>
                {canEdit
                  ? `This ${noun}'s rules in the API's format. Saving sends them as written, and the API checks them.`
                  : `This ${noun}'s rules in the API's format.`}
              </CardDescription>
            </CardHeader>
            <CodeEditor
              value={jsonText}
              onChange={canEdit ? onJsonTextChange : undefined}
              isReadOnly={!canEdit}
              className="h-[32rem]"
              aria-label={`${noun === "role" ? "Role" : "Policy"} rules as JSON`}
            />
            {jsonError && (
              <p className="-mt-2 flex items-start gap-1.5 text-xs text-danger">
                <CircleAlertIcon className="mt-px size-3.5 shrink-0" />
                {jsonError}
              </p>
            )}
          </Card>
        </TabsContent>
      </Tabs>
      {aside && (
        <aside
          className={cn(
            "flex min-w-0 flex-col gap-6",
            isSplit && "dashboard:sticky dashboard:top-4"
          )}
        >
          {aside}
        </aside>
      )}
    </div>
  );
};
