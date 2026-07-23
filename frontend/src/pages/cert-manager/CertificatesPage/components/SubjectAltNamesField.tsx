import { Control, Controller } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { CertSubjectAlternativeNameType } from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { getSanPlaceholder, getSanTypeLabels, SubjectAltName } from "./certificateUtils";

type SubjectAltNamesFieldProps = {
  control: Control<any>;
  allowedSanTypes: CertSubjectAlternativeNameType[];
  error?: string;
  shouldUnregister?: boolean;
  namePrefix?: string;
};

export const SubjectAltNamesField = ({
  control,
  allowedSanTypes,
  error,
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
            <div className="space-y-2">
              {currentValues.map((san, index) => (
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
                    <SelectTrigger className="w-32">
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
                  <Input
                    value={san.value}
                    onChange={(e) => {
                      const newValue = [...currentValues];
                      newValue[index] = { ...san, value: e.target.value };
                      onChange(newValue);
                    }}
                    placeholder={getSanPlaceholder(san.type)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange(currentValues.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
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
          </Field>
        );
      }}
    />
  );
};
