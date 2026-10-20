import { Plus, Trash2 } from "lucide-react";

import {
  Button,
  Checkbox,
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
import { TProfileCustomExtension } from "@app/hooks/api/certificateProfiles/types";
import { CustomExtensionOidSelect } from "@app/pages/cert-manager/components/CustomExtensionOidSelect";

import {
  CertExtensionCriticality,
  customExtensionLabelFor,
  getCustomExtensionValuePlaceholder,
  isPresetExtensionOid,
  validateCustomExtensionValue
} from "../../CertificatePoliciesTab/shared/certificate-constants";
import { SectionHeading } from "./SectionHeading";

type Props = {
  allowedCustomExtensions: Array<{
    oid: string;
    label?: string;
    critical?: CertExtensionCriticality;
  }> | null;
  extensions: TProfileCustomExtension[];
  onChange: (next: TProfileCustomExtension[]) => void;
};

export const CustomExtensionDefaults = ({
  allowedCustomExtensions,
  extensions,
  onChange
}: Props) => {
  const isDisabled = allowedCustomExtensions !== null && allowedCustomExtensions.length === 0;
  const selectableOids = allowedCustomExtensions?.map((rule) => rule.oid) ?? null;

  const replace = (index: number, next: TProfileCustomExtension) => {
    const updated = [...extensions];
    updated[index] = next;
    onChange(updated);
  };

  const update = (index: number, patch: Partial<TProfileCustomExtension>) => {
    const next = [...extensions];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const criticalityPinnedFor = (oid: string) =>
    allowedCustomExtensions?.find((rule) => rule.oid === oid)?.critical;

  const allSelectableOidsUsed = Boolean(
    selectableOids?.length &&
      selectableOids.every((oid) => extensions.some((extension) => extension.oid === oid))
  );

  const takenOidsExcept = (index: number) =>
    new Set(
      extensions
        .filter((_, i) => i !== index)
        .map((extension) => extension.oid)
        .filter(Boolean)
    );

  const declarationFor = (oid: string): TProfileCustomExtension => {
    const pinned = criticalityPinnedFor(oid);
    return { oid, critical: pinned ? pinned === CertExtensionCriticality.CRITICAL : false };
  };

  return (
    <div>
      <SectionHeading
        title="Custom Extensions"
        description="Declare the custom X.509 extensions certificates from this profile may carry."
      />
      <div className="mt-4 space-y-3">
        {isDisabled && (
          <p className="text-xs text-muted">
            The selected policy does not allow any custom extensions.
          </p>
        )}

        {!isDisabled && (
          <>
            {extensions.length === 0 && (
              <p className="text-xs text-muted">No custom extensions declared.</p>
            )}

            {extensions.map((extension, index) => {
              const isPreset = isPresetExtensionOid(extension.oid);
              const placeholder = getCustomExtensionValuePlaceholder(extension.oid);
              const criticalityPinned = criticalityPinnedFor(extension.oid);
              const criticalityLocked = isPreset || Boolean(criticalityPinned);
              const isCritical = criticalityPinned
                ? criticalityPinned === CertExtensionCriticality.CRITICAL
                : Boolean(extension.critical);
              const valueError =
                extension.oid && extension.value
                  ? validateCustomExtensionValue(extension.oid, extension.value)
                  : null;

              const criticalityCheckbox = (
                <Checkbox
                  variant="project"
                  isChecked={isCritical}
                  isDisabled={criticalityLocked}
                  aria-label="Critical"
                  onCheckedChange={(checked) => update(index, { critical: checked === true })}
                />
              );

              return (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={`profile-extension-${index}`}
                  className="flex items-start gap-3"
                >
                  {selectableOids ? (
                    <Select
                      value={extension.oid || undefined}
                      onValueChange={(oid) => replace(index, declarationFor(oid))}
                    >
                      <SelectTrigger className="min-w-0 flex-[3]" aria-label="Extension">
                        <SelectValue placeholder="Select an extension" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {selectableOids
                          .filter((oid) => !takenOidsExcept(index).has(oid))
                          .map((oid) => (
                            <SelectItem key={oid} value={oid}>
                              {customExtensionLabelFor(
                                oid,
                                allowedCustomExtensions?.find((rule) => rule.oid === oid)?.label
                              )}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <CustomExtensionOidSelect
                      className="min-w-0 flex-[3]"
                      placeholder="Select OID"
                      value={extension.oid}
                      excludeOids={[...takenOidsExcept(index)]}
                      onChange={(oid) => replace(index, declarationFor(oid))}
                    />
                  )}

                  <div className="min-w-0 flex-[4]">
                    <Input
                      className="w-full"
                      placeholder={placeholder}
                      value={extension.value ?? ""}
                      isError={Boolean(valueError)}
                      onChange={(e) => update(index, { value: e.target.value })}
                    />
                    {valueError && <p className="mt-1 text-xs text-danger">{valueError}</p>}
                  </div>

                  <div className="flex h-9 shrink-0 items-center gap-2">
                    {criticalityLocked ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                          <span tabIndex={0} className="flex items-center">
                            {criticalityCheckbox}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-64">
                          {isPreset
                            ? "Criticality is fixed for this extension because Active Directory rejects certificates that mark it differently."
                            : "The certificate policy pins the criticality for this object identifier."}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      criticalityCheckbox
                    )}
                    <span className="text-sm whitespace-nowrap text-muted">Critical</span>
                  </div>

                  <IconButton
                    type="button"
                    variant="ghost"
                    aria-label="Remove custom extension"
                    onClick={() => onChange(extensions.filter((_, i) => i !== index))}
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
              isDisabled={allSelectableOidsUsed}
              onClick={() => {
                const taken = new Set(extensions.map((extension) => extension.oid));
                const nextOid = selectableOids?.find((oid) => !taken.has(oid)) ?? "";
                onChange([...extensions, declarationFor(nextOid)]);
              }}
            >
              <Plus className="size-4" /> Add extension
            </Button>
            {allSelectableOidsUsed && (
              <p className="text-xs text-muted">
                Every extension this policy allows is already declared.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};
