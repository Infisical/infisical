import { Control, Controller } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import {
  Button,
  Checkbox,
  Field,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TCustomExtensionRule } from "@app/hooks/api/certificatePolicies";
import { TProfileCustomExtension } from "@app/hooks/api/certificateProfiles/types";
import { CustomExtensionOidSelect } from "@app/pages/cert-manager/components/CustomExtensionOidSelect";
import {
  customExtensionLabelFor,
  getCustomExtensionValuePlaceholder,
  isPresetExtensionOid
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { PolicyRowMessage } from "./PolicyRowMessage";

export type TRequestCustomExtension = {
  oid: string;
  value: string;
  critical?: boolean;
};

type Props = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  declarations: TProfileCustomExtension[];
  policyRules?: TCustomExtensionRule[] | null;
  errorsByOid?: Record<string, string>;
  revealPolicyErrors?: boolean;
};

export const RequestCustomExtensionsField = ({
  control,
  declarations,
  policyRules,
  errorsByOid,
  revealPolicyErrors
}: Props) => {
  const isUnrestricted = policyRules === undefined || policyRules === null;

  const isPinned = (declaration: TProfileCustomExtension) =>
    Boolean(declaration.value?.trim()) ||
    Boolean(policyRules?.find((rule) => rule.oid === declaration.oid)?.required?.length);

  const effectiveDeclarations: TProfileCustomExtension[] = [
    ...declarations,
    ...(policyRules ?? [])
      .filter(
        (rule) =>
          rule.required?.length && !declarations.some((declaration) => declaration.oid === rule.oid)
      )
      .map((rule) => ({ oid: rule.oid, label: rule.label ?? undefined }))
  ];

  const pinnedDeclarations = effectiveDeclarations.filter(isPinned);
  const pinnedOids = pinnedDeclarations.map((declaration) => declaration.oid);
  const declarationByOid = new Map(
    effectiveDeclarations.map((declaration) => [declaration.oid, declaration] as const)
  );

  return (
    <Controller
      control={control}
      name="customExtensions"
      defaultValue={[]}
      render={({ field: { onChange, value } }) => {
        const rows: TRequestCustomExtension[] = value || [];
        const addedRows = rows.filter((row) => !pinnedOids.includes(row.oid));
        const usedOids = [...pinnedOids, ...addedRows.map((row) => row.oid)];

        const offerableOids = (
          policyRules?.map((rule) => rule.oid) ?? [...declarationByOid.keys()]
        ).filter((oid) => !usedOids.includes(oid));

        const labelOf = (oid: string) =>
          customExtensionLabelFor(
            oid,
            declarationByOid.get(oid)?.label ?? policyRules?.find((rule) => rule.oid === oid)?.label
          );

        const upsert = (oid: string, patch: Partial<TRequestCustomExtension>) => {
          const index = rows.findIndex((row) => row.oid === oid);
          if (index === -1) {
            onChange([...rows, { oid, value: "", ...patch }]);
            return;
          }
          const updated = [...rows];
          updated[index] = { ...updated[index], oid, ...patch };
          onChange(updated);
        };

        const rowError = (oid: string) => (revealPolicyErrors ? errorsByOid?.[oid] : undefined);

        const criticalityLock = (oid: string): string | null => {
          if (!oid) return null;
          if (isPresetExtensionOid(oid)) {
            return "Criticality is fixed for this extension because Active Directory rejects certificates that mark it differently.";
          }
          const pinned = policyRules?.find((rule) => rule.oid === oid)?.critical;
          return pinned
            ? "The certificate policy pins the criticality for this object identifier."
            : null;
        };

        const renderCriticality = (
          oid: string,
          isCritical: boolean,
          onToggle: (next: boolean) => void
        ) => {
          const lock = criticalityLock(oid);
          const box = (
            <Checkbox
              variant="project"
              isChecked={isCritical}
              isDisabled={Boolean(lock)}
              aria-label="Critical"
              onCheckedChange={(checked) => onToggle(checked === true)}
            />
          );

          return (
            <div className="flex h-9 shrink-0 items-center gap-2">
              {lock ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                    <span tabIndex={0} className="flex items-center">
                      {box}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-64">
                    {lock}
                  </TooltipContent>
                </Tooltip>
              ) : (
                box
              )}
              <span className="text-sm whitespace-nowrap text-muted">Critical</span>
            </div>
          );
        };

        return (
          <Field>
            <FieldLabel>Custom Extensions</FieldLabel>
            <div className="space-y-3">
              {pinnedDeclarations.map((declaration) => {
                const placeholder = getCustomExtensionValuePlaceholder(declaration.oid);
                const error = rowError(declaration.oid);
                const current = rows.find((row) => row.oid === declaration.oid);

                return (
                  <div key={`declared-${declaration.oid}`} className="flex items-start gap-2">
                    <Input
                      className="w-44 shrink-0 font-mono text-xs"
                      value={labelOf(declaration.oid)}
                      disabled
                    />
                    <div className="min-w-0 flex-1">
                      <Input
                        className="w-full"
                        value={current?.value ?? declaration.value ?? ""}
                        onChange={(e) => upsert(declaration.oid, { value: e.target.value })}
                        placeholder={placeholder}
                        isError={Boolean(error)}
                      />
                      {error && <PolicyRowMessage isError lines={[error]} />}
                    </div>
                    {renderCriticality(declaration.oid, Boolean(current?.critical), (next) =>
                      upsert(declaration.oid, { critical: next })
                    )}
                    <span className="w-9 shrink-0" />
                  </div>
                );
              })}

              {rows.map((row, index) => {
                if (pinnedOids.includes(row.oid)) return null;
                const placeholder = getCustomExtensionValuePlaceholder(row.oid);
                const error = rowError(row.oid);
                const selectableOids = row.oid ? [row.oid, ...offerableOids] : offerableOids;

                const replaceRow = (next: TRequestCustomExtension) => {
                  const updated = [...rows];
                  updated[index] = next;
                  onChange(updated);
                };

                const selectOid = (oid: string) =>
                  replaceRow({ oid, value: row.value || (declarationByOid.get(oid)?.value ?? "") });

                return (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={`custom-extension-${index}`} className="flex items-start gap-2">
                    {isUnrestricted ? (
                      <CustomExtensionOidSelect
                        className="w-44 shrink-0"
                        value={row.oid}
                        onChange={selectOid}
                        extraOptions={offerableOids.map((oid) => ({
                          oid,
                          name: declarationByOid.get(oid)?.label
                        }))}
                        isError={Boolean(error)}
                      />
                    ) : (
                      <Select value={row.oid || undefined} onValueChange={selectOid}>
                        <SelectTrigger className="w-44 shrink-0" aria-label="Extension">
                          <SelectValue placeholder="Select an extension" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {selectableOids.map((oid) => (
                            <SelectItem key={oid} value={oid}>
                              {labelOf(oid)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="min-w-0 flex-1">
                      <Input
                        className="w-full"
                        value={row.value}
                        onChange={(e) => replaceRow({ ...row, value: e.target.value })}
                        placeholder={placeholder}
                        isError={Boolean(error)}
                      />
                      {error && <PolicyRowMessage isError lines={[error]} />}
                    </div>
                    {renderCriticality(row.oid, Boolean(row.critical), (next) =>
                      replaceRow({ ...row, critical: next })
                    )}
                    <IconButton
                      type="button"
                      variant="ghost"
                      aria-label="Remove entry"
                      onClick={() => onChange(rows.filter((_, i) => i !== index))}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                );
              })}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange([...rows, { oid: "", value: "" }])}
              >
                <Plus className="size-4" /> Add extension
              </Button>
            </div>
          </Field>
        );
      }}
    />
  );
};
