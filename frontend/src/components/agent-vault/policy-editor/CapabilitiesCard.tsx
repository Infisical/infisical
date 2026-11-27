import { Fragment } from "react";
import { TriangleAlertIcon, XIcon } from "lucide-react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";

import { ActionRows, ExpandToggle } from "./ActionRows";
import {
  CUSTOM_LEVEL,
  getRowLevel,
  getRowRisk,
  getRowWarnings,
  isLevelPrivileged,
  isResourceRowKey,
  PERMISSION_ROWS,
  setRowLevel,
  TAgentVaultPolicy,
  TPermissionRowKey,
  TPolicyKind
} from "./agentVaultPolicyModel";
import { LevelSelect } from "./LevelSelect";
import { PrivilegedMarker } from "./PrivilegedMarker";

export const RowWarnings = ({ warnings }: { warnings: string[] }) => {
  if (!warnings.length) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-xs text-warning">
      {warnings.map((warning) => (
        <li key={warning} className="flex items-start gap-1.5">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
          {warning}
        </li>
      ))}
    </ul>
  );
};

const CAPABILITY_ROWS = PERMISSION_ROWS.filter((row) => !isResourceRowKey(row.key));

type Props = {
  noun: TPolicyKind;
  policy: TAgentVaultPolicy;
  onChange: (policy: TAgentVaultPolicy) => void;
  isReadOnly: boolean;
  isScopeOpen: (scopeKey: string) => boolean;
  onScopeOpenChange: (scopeKey: string, isOpen: boolean) => void;
  isScopeCollapsed: (scopeKey: string) => boolean;
  onScopeCollapsedChange: (scopeKey: string, isCollapsed: boolean) => void;
  // The rows the role holds or that were added; the card lists only these.
  shownRows: TPermissionRowKey[];
  // Takes a row off the role, with everything it grants. Left out where the role can't be edited.
  onRemoveRow?: (rowKey: TPermissionRowKey) => void;
};

export const CapabilitiesCard = ({
  noun,
  policy,
  onChange,
  isReadOnly,
  isScopeOpen,
  onScopeOpenChange,
  isScopeCollapsed,
  onScopeCollapsedChange,
  shownRows,
  onRemoveRow
}: Props) => {
  const rows = CAPABILITY_ROWS.filter((row) => shownRows.includes(row.key));
  if (!rows.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capabilities</CardTitle>
        <CardDescription>What else this {noun} grants in the project.</CardDescription>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full">Capability</TableHead>
            <TableHead>Access</TableHead>
            {onRemoveRow && <TableHead variant="action" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const level = getRowLevel(policy, row.key);
            const isCustom = level === CUSTOM_LEVEL || isScopeOpen(row.key);
            const isExpanded = isCustom && !isScopeCollapsed(row.key);
            const risk = getRowRisk(policy, row.key);
            const warnings = getRowWarnings(policy, row.key, noun).map(({ message }) => message);

            return (
              <Fragment key={row.key}>
                <TableRow>
                  <TableCell isWrappable className="max-w-0">
                    <div className="flex items-start gap-3">
                      <div className="pt-px">
                        <ExpandToggle
                          isVisible={isCustom}
                          isExpanded={isExpanded}
                          label={row.label}
                          onToggle={() => onScopeCollapsedChange(row.key, isExpanded)}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{row.label}</span>
                          {risk && <PrivilegedMarker risk={risk} />}
                        </div>
                        <p className="text-xs leading-4 text-muted">{row.description}</p>
                        <RowWarnings warnings={warnings} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <LevelSelect
                      value={isCustom ? CUSTOM_LEVEL : level}
                      options={row.levels.map(({ value, label }) => ({
                        value,
                        label,
                        description: isLevelPrivileged(row.key, value) ? (
                          <PrivilegedMarker />
                        ) : undefined
                      }))}
                      ariaLabel={row.label}
                      className="w-56"
                      isDisabled={isReadOnly}
                      onLevelChange={(next) => {
                        onScopeOpenChange(row.key, false);
                        onChange(setRowLevel(policy, row.key, next));
                      }}
                      onCustom={() => onScopeOpenChange(row.key, true)}
                    />
                  </TableCell>
                  {onRemoveRow && (
                    <TableCell variant="action">
                      <IconButton
                        variant="ghost"
                        size="xs"
                        aria-label={`Remove ${row.label}`}
                        onClick={() => {
                          onScopeOpenChange(row.key, false);
                          onRemoveRow(row.key);
                        }}
                      >
                        <XIcon />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
                {isExpanded && (
                  <ActionRows
                    policy={policy}
                    scope={{ rowKey: row.key }}
                    scopeLabel={row.label}
                    isReadOnly={isReadOnly}
                    onChange={onChange}
                    accessClassName="w-56"
                    hasTrailingCell={Boolean(onRemoveRow)}
                  />
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
};
