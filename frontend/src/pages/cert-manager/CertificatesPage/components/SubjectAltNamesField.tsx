import { Control, Controller } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { CertSubjectAlternativeNameType } from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { PolicyNotice, PolicyRowGuidance } from "./certificatePolicyGuidance";
import { getSanPlaceholder, getSanTypeLabels, SubjectAltName } from "./certificateUtils";
import { PolicyNoticeList } from "./PolicyNoticeList";
import { PolicyRowMessage } from "./PolicyRowMessage";

type SubjectAltNamesFieldProps = {
  control: Control<any>;
  allowedSanTypes: CertSubjectAlternativeNameType[];
  error?: string;
  rowErrors?: (string | undefined)[];
  /** Per-row policy findings: the constraint, how the value breaks it, and whether it is fixed. */
  policyRows?: PolicyRowGuidance[];
  /** Violations spanning several rows, such as an unmet required SAN pattern. */
  policyNotices?: PolicyNotice[];
  /** Policy findings stay hidden until the requester tries to leave the step. */
  revealPolicyErrors?: boolean;
  shouldUnregister?: boolean;
  namePrefix?: string;
};

export const SubjectAltNamesField = ({
  control,
  allowedSanTypes,
  error,
  rowErrors,
  policyRows,
  policyNotices,
  revealPolicyErrors,
  shouldUnregister,
  namePrefix = "subjectAltNames"
}: SubjectAltNamesFieldProps) => {
  const sanTypeLabels = getSanTypeLabels();

  return (
    <Controller
      control={control}
      name={namePrefix}
      shouldUnregister={shouldUnregister}
      render={({ field: { onChange, value } }) => {
        const currentValues: SubjectAltName[] = value || [];
        return (
          <Field className="mb-4">
            <FieldLabel>Subject Alternative Names (SANs)</FieldLabel>
            <div className="space-y-3">
              {currentValues.map((san, index) => {
                const policy = policyRows?.[index];
                const rowError =
                  rowErrors?.[index] ?? (revealPolicyErrors ? policy?.error : undefined);

                return (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={`subject-alt-name-${index}`} className="flex items-start gap-2">
                    <Select
                      value={san.type}
                      onValueChange={(newType) => {
                        const newValue = [...currentValues];
                        newValue[index] = {
                          ...san,
                          type: newType as CertSubjectAlternativeNameType
                        };
                        onChange(newValue);
                      }}
                    >
                      <SelectTrigger className="w-32" disabled={policy?.isLocked}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {allowedSanTypes.map((sanType) => (
                          <SelectItem key={sanType} value={sanType}>
                            {sanTypeLabels[sanType]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="min-w-0 flex-1">
                      <Input
                        value={san.value}
                        onChange={(e) => {
                          const newValue = [...currentValues];
                          newValue[index] = { ...san, value: e.target.value };
                          onChange(newValue);
                        }}
                        placeholder={getSanPlaceholder(san.type)}
                        isError={Boolean(rowError)}
                        className="w-full"
                      />
                      {rowError && <PolicyRowMessage isError lines={[rowError]} />}
                      {!rowError && policy?.hint && <PolicyRowMessage lines={policy.hint} />}
                    </div>
                    {policy?.isLocked ? (
                      <span className="w-9 shrink-0" />
                    ) : (
                      <IconButton
                        type="button"
                        variant="ghost"
                        aria-label="Remove entry"
                        onClick={() => onChange(currentValues.filter((_, i) => i !== index))}
                      >
                        <Trash2 />
                      </IconButton>
                    )}
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const defaultType =
                    allowedSanTypes.length > 0
                      ? allowedSanTypes[0]
                      : CertSubjectAlternativeNameType.DNS_NAME;
                  onChange([...currentValues, { type: defaultType, value: "" }]);
                }}
              >
                <Plus className="size-4" /> Add SAN
              </Button>
            </div>
            <FieldError>{error}</FieldError>
            {revealPolicyErrors && <PolicyNoticeList notices={policyNotices ?? []} />}
          </Field>
        );
      }}
    />
  );
};
