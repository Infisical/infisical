import { Fragment } from "react";
import { TriangleAlertIcon } from "lucide-react";

import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

import { ActionRows } from "./ActionRows";
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
  TPolicyKind
} from "./agentVaultPolicyModel";
import { LevelSelect, PrivilegedOption } from "./LevelSelect";

export const PrivilegedBadge = ({ risk }: { risk: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Badge variant="outline" data-row-interactive>
        Privileged
      </Badge>
    </TooltipTrigger>
    <TooltipContent className="max-w-xs">{risk}</TooltipContent>
  </Tooltip>
);

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
};

export const CapabilitiesCard = ({
  noun,
  policy,
  onChange,
  isReadOnly,
  isScopeOpen,
  onScopeOpenChange
}: Props) => (
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
        </TableRow>
      </TableHeader>
      <TableBody>
        {CAPABILITY_ROWS.map((row) => {
          const level = getRowLevel(policy, row.key);
          const isOpen = level === CUSTOM_LEVEL || isScopeOpen(row.key);
          const risk = getRowRisk(policy, row.key);
          const warnings = getRowWarnings(policy, row.key, noun).map(({ message }) => message);

          return (
            <Fragment key={row.key}>
              <TableRow>
                <TableCell className="max-w-0 py-2.5 whitespace-normal">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{row.label}</span>
                    {risk && <PrivilegedBadge risk={risk} />}
                  </div>
                  <p className="text-xs leading-4 text-muted">{row.description}</p>
                  <RowWarnings warnings={warnings} />
                </TableCell>
                <TableCell>
                  <LevelSelect
                    value={isOpen ? CUSTOM_LEVEL : level}
                    options={row.levels.map(({ value, label }) => ({
                      value,
                      label,
                      description: isLevelPrivileged(row.key, value) ? (
                        <PrivilegedOption />
                      ) : undefined
                    }))}
                    ariaLabel={row.label}
                    className="w-44"
                    isDisabled={isReadOnly}
                    onLevelChange={(next) => {
                      onScopeOpenChange(row.key, false);
                      onChange(setRowLevel(policy, row.key, next));
                    }}
                    onCustom={() => onScopeOpenChange(row.key, true)}
                  />
                </TableCell>
              </TableRow>
              {isOpen && (
                <ActionRows
                  policy={policy}
                  scope={{ rowKey: row.key }}
                  scopeLabel={row.label}
                  isReadOnly={isReadOnly}
                  onChange={onChange}
                  accessClassName="w-44"
                />
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  </Card>
);
