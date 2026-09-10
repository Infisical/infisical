import { useEffect, useState } from "react";

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { CustomExtensionOidSelect } from "@app/pages/cert-manager/components/CustomExtensionOidSelect";
import {
  CertExtensionCriticality,
  CertExtensionInclude,
  customExtensionLabelFor,
  getPresetExtensionCriticality,
  isPresetExtensionOid
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

export const ANY_CRITICALITY = "any";

export type TCustomExtensionRuleDraft = {
  oid: string;
  label: string;
  include: CertExtensionInclude;
  critical: CertExtensionCriticality | "";
  value: string;
};

const INCLUDE_OPTIONS = [
  { value: CertExtensionInclude.ALLOWED, label: "Allowed" },
  { value: CertExtensionInclude.REQUIRED, label: "Required" },
  { value: CertExtensionInclude.DENIED, label: "Denied" }
] as const;

export const CUSTOM_EXTENSION_CRITICALITY_LABELS: Record<string, string> = {
  "": "Critical and non-critical allowed",
  [CertExtensionCriticality.CRITICAL]: "Always critical",
  [CertExtensionCriticality.NOT_CRITICAL]: "Never critical"
};

const CRITICALITY_OPTIONS = [
  { value: ANY_CRITICALITY, label: CUSTOM_EXTENSION_CRITICALITY_LABELS[""] },
  {
    value: CertExtensionCriticality.CRITICAL,
    label: CUSTOM_EXTENSION_CRITICALITY_LABELS[CertExtensionCriticality.CRITICAL]
  },
  {
    value: CertExtensionCriticality.NOT_CRITICAL,
    label: CUSTOM_EXTENSION_CRITICALITY_LABELS[CertExtensionCriticality.NOT_CRITICAL]
  }
] as const;

const OID_PATTERN = /^[0-2](\.(0|[1-9][0-9]{0,14})){1,20}$/;

const EMPTY_DRAFT: TCustomExtensionRuleDraft = {
  oid: "",
  label: "",
  include: CertExtensionInclude.ALLOWED,
  critical: "",
  value: "*"
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (rule: TCustomExtensionRuleDraft) => void;
  initialRule?: TCustomExtensionRuleDraft | null;
};

export const CustomExtensionRuleDialog = ({
  isOpen,
  onOpenChange,
  onConfirm,
  initialRule
}: Props) => {
  const isEdit = Boolean(initialRule);
  const [draft, setDraft] = useState<TCustomExtensionRuleDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(initialRule ?? EMPTY_DRAFT);
      setError(null);
    }
  }, [isOpen, initialRule]);

  const isPreset = isPresetExtensionOid(draft.oid);

  const handleConfirm = () => {
    const oid = draft.oid.trim();
    if (!OID_PATTERN.test(oid)) {
      setError("Enter a valid object identifier, for example 1.3.6.1.4.1.311.25.2");
      return;
    }
    onConfirm({
      ...draft,
      oid,
      label: isPreset ? "" : draft.label.trim(),
      critical: isPreset ? "" : draft.critical,
      value: draft.value.trim() || "*"
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit custom extension rule" : "Add custom extension rule"}
          </DialogTitle>
          <DialogDescription>
            Add one value pattern for an object identifier. Add several rules for the same OID to
            accept more than one value.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field>
            <FieldLabel>Object identifier</FieldLabel>
            <FieldContent>
              <CustomExtensionOidSelect
                placeholder="Select or enter an OID"
                value={draft.oid}
                onChange={(oid) => {
                  setDraft((current) => ({ ...current, oid }));
                  setError(null);
                }}
                isError={Boolean(error)}
              />
              {error && <FieldError>{error}</FieldError>}
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldContent>
              <Input
                placeholder="e.g. Device compliance marker"
                value={isPreset ? customExtensionLabelFor(draft.oid) : draft.label}
                disabled={isPreset}
                onChange={(e) => setDraft((current) => ({ ...current, label: e.target.value }))}
              />
              <FieldDescription>
                {isPreset
                  ? "Infisical names this extension."
                  : "Optional label, shown wherever this extension appears."}
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>Rule</FieldLabel>
            <FieldContent>
              <Select
                value={draft.include}
                onValueChange={(value) =>
                  setDraft((current) => ({ ...current, include: value as CertExtensionInclude }))
                }
              >
                <SelectTrigger className="w-full" aria-label="Rule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {INCLUDE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>Criticality</FieldLabel>
            <FieldContent>
              <Select
                value={
                  (isPreset ? getPresetExtensionCriticality(draft.oid) : draft.critical) ||
                  ANY_CRITICALITY
                }
                disabled={isPreset}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    critical: value === ANY_CRITICALITY ? "" : (value as CertExtensionCriticality)
                  }))
                }
              >
                <SelectTrigger className="w-full" aria-label="Criticality">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {CRITICALITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isPreset && (
                <FieldDescription>Fixed by this extension&apos;s specification.</FieldDescription>
              )}
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>Value pattern</FieldLabel>
            <FieldContent>
              <Input
                placeholder="*"
                value={draft.value}
                onChange={(e) => setDraft((current) => ({ ...current, value: e.target.value }))}
              />
              <FieldDescription>
                One value this rule matches, with * as a wildcard. Use * alone for any value.
              </FieldDescription>
            </FieldContent>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm}>
            {isEdit ? "Save rule" : "Add extension"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
