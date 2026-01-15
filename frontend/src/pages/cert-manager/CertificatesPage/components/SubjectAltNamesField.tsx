import { Control, Controller } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, FormControl, IconButton, Input, Select, SelectItem } from "@app/components/v2";
import { CertSubjectAlternativeNameType } from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { getSanPlaceholder, getSanTypeLabels, SubjectAltName } from "./certificateUtils";

type SubjectAltNamesFieldProps = {
  control: Control<any>;
  allowedSanTypes: CertSubjectAlternativeNameType[];
  error?: string;
};

export const SubjectAltNamesField = ({
  control,
  allowedSanTypes,
  error
}: SubjectAltNamesFieldProps) => {
  const sanTypeLabels = getSanTypeLabels();

  return (
    <Controller
      control={control}
      name="subjectAltNames"
      render={({ field: { onChange, value } }) => (
        <FormControl
          label="Subject Alternative Names (SANs)"
          errorText={error}
          isError={Boolean(error)}
        >
          <div className="space-y-2">
            {value.map((san: SubjectAltName, index: number) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={`subject-alt-name-${index}`} className="flex items-center gap-2">
                <Select
                  value={san.type}
                  onValueChange={(newType) => {
                    const newValue = [...value];
                    newValue[index] = {
                      ...san,
                      type: newType as CertSubjectAlternativeNameType
                    };
                    onChange(newValue);
                  }}
                  className="w-24"
                >
                  {allowedSanTypes.map((sanType) => (
                    <SelectItem key={sanType} value={sanType}>
                      {sanTypeLabels[sanType]}
                    </SelectItem>
                  ))}
                </Select>
                <Input
                  value={san.value}
                  onChange={(e) => {
                    const newValue = [...value];
                    newValue[index] = { ...san, value: e.target.value };
                    onChange(newValue);
                  }}
                  placeholder={getSanPlaceholder(san.type)}
                  className="flex-1"
                />
                <IconButton
                  ariaLabel="Remove SAN"
                  variant="plain"
                  size="sm"
                  onClick={() => {
                    const newValue = value.filter((_: any, i: number) => i !== index);
                    onChange(newValue);
                  }}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              </div>
            ))}
            <Button
              type="button"
              variant="outline_bg"
              size="xs"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => {
                const defaultType =
                  allowedSanTypes.length > 0
                    ? allowedSanTypes[0]
                    : CertSubjectAlternativeNameType.DNS_NAME;
                onChange([...value, { type: defaultType, value: "" }]);
              }}
              className="w-full"
            >
              Add SAN
            </Button>
          </div>
        </FormControl>
      )}
    />
  );
};
