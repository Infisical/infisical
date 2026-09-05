import { Plus, Trash2 } from "lucide-react";

import {
  Button,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { TProfileCustomExtension } from "@app/hooks/api/certificateProfiles/types";
import { CustomExtensionOidSelect } from "@app/pages/cert-manager/components/CustomExtensionOidSelect";

import {
  CertExtensionCriticality,
  customExtensionLabelFor,
  getCustomExtensionValuePlaceholder,
  isPresetExtensionOid
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

  const declarationFor = (oid: string): TProfileCustomExtension => {
    const pinned = criticalityPinnedFor(oid);
    return { oid, critical: pinned ? pinned === CertExtensionCriticality.CRITICAL : false };
  };

  return (
    <div>
      <SectionHeading
        title="Custom Extensions"
        description="Declare the custom X.509 extensions certificates from this profile may carry. Leave a value empty to have the request supply it."
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

              return (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={`profile-extension-${index}`}
                  className="flex items-start gap-2"
                >
                  {selectableOids ? (
                    <Select
                      value={extension.oid || undefined}
                      onValueChange={(oid) => replace(index, declarationFor(oid))}
                    >
                      <SelectTrigger className="min-w-0 flex-[2]">
                        <SelectValue placeholder="Select an extension" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {selectableOids.map((oid) => (
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
                      className="min-w-0 flex-[2]"
                      placeholder="Select OID"
                      value={extension.oid}
                      onChange={(oid) => replace(index, declarationFor(oid))}
                    />
                  )}

                  <Select
                    value={
                      (criticalityPinned ??
                        (extension.critical
                          ? CertExtensionCriticality.CRITICAL
                          : CertExtensionCriticality.NOT_CRITICAL)) as CertExtensionCriticality
                    }
                    disabled={isPreset || Boolean(criticalityPinned)}
                    onValueChange={(value) =>
                      update(index, { critical: value === CertExtensionCriticality.CRITICAL })
                    }
                  >
                    <SelectTrigger className="w-28 shrink-0" aria-label="Criticality">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value={CertExtensionCriticality.NOT_CRITICAL}>
                        Not critical
                      </SelectItem>
                      <SelectItem value={CertExtensionCriticality.CRITICAL}>Critical</SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    className="min-w-0 flex-1"
                    placeholder={placeholder}
                    value={extension.value ?? ""}
                    onChange={(e) => update(index, { value: e.target.value })}
                  />

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
              onClick={() => {
                const taken = new Set(extensions.map((extension) => extension.oid));
                const nextOid = selectableOids?.find((oid) => !taken.has(oid)) ?? "";
                onChange([...extensions, declarationFor(nextOid)]);
              }}
            >
              <Plus className="size-4" /> Declare extension
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
