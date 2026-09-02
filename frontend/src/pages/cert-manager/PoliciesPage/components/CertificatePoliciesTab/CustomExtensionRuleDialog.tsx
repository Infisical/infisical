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
  CertExtensionRuleKind,
  customExtensionLabelFor,
  isPresetExtensionOid
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

export const ANY_CRITICALITY = "any";

export type TCustomExtensionRuleDraft = {
  oid: string;
  label: string;
  rule: CertExtensionRuleKind;
  critical: CertExtensionCriticality | "";
  value: string;
};

const RULE_OPTIONS = [
  { value: CertExtensionRuleKind.ALLOW, label: "Allow" },
  { value: CertExtensionRuleKind.REQUIRE, label: "Require" },
  { value: CertExtensionRuleKind.DENY, label: "Deny" }
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
  rule: CertExtensionRuleKind.ALLOW,
  critical: "",
  value: "*"
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  usedOids: string[];
  onConfirm: (rule: TCustomExtensionRuleDraft) => void;
};

export const CustomExtensionRuleDialog = ({ isOpen, onOpenChange, usedOids, onConfirm }: Props) => {
  const [draft, setDraft] = useState<TCustomExtensionRuleDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(EMPTY_DRAFT);
      setError(null);
    }
  }, [isOpen]);

  const isPreset = isPresetExtensionOid(draft.oid);

  const handleConfirm = () => {
    const oid = draft.oid.trim();
    if (!OID_PATTERN.test(oid)) {
      setError("Enter a valid object identifier, for example 1.3.6.1.4.1.311.25.2");
      return;
    }
    if (usedOids.includes(oid)) {
      setError("This policy already has a rule for that object identifier.");
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
          <DialogTitle>Add custom extension rule</DialogTitle>
          <DialogDescription>
            Constrain the values certificates may carry for one object identifier.
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
                value={draft.rule}
                onValueChange={(value) =>
                  setDraft((current) => ({ ...current, rule: value as CertExtensionRuleKind }))
                }
              >
                <SelectTrigger className="w-full" aria-label="Rule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {RULE_OPTIONS.map((option) => (
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
                value={draft.critical || ANY_CRITICALITY}
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
                Values this rule matches, with * as a wildcard. Use * alone for any value.
              </FieldDescription>
            </FieldContent>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm}>
            Add extension
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
