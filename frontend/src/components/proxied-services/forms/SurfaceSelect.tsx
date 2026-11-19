import { Combobox } from "@app/components/v3";
import { ProxiedServiceSubstitutionSurface } from "@app/hooks/api/proxiedServices/enums";

const SURFACE_LABELS: Record<ProxiedServiceSubstitutionSurface, string> = {
  [ProxiedServiceSubstitutionSurface.Path]: "Path",
  [ProxiedServiceSubstitutionSurface.Query]: "Query",
  [ProxiedServiceSubstitutionSurface.Body]: "Body",
  [ProxiedServiceSubstitutionSurface.Header]: "Header"
};

type SurfaceOption = {
  value: ProxiedServiceSubstitutionSurface;
  label: string;
};

const SURFACE_OPTIONS: SurfaceOption[] = Object.values(ProxiedServiceSubstitutionSurface).map(
  (surface) => ({ value: surface, label: SURFACE_LABELS[surface] })
);

type Props = {
  value: ProxiedServiceSubstitutionSurface[];
  onChange: (value: ProxiedServiceSubstitutionSurface[]) => void;
  isDisabled?: boolean;
  isError?: boolean;
};

export const SurfaceSelect = ({ value, onChange, isDisabled, isError }: Props) => (
  <Combobox
    multiple
    value={SURFACE_OPTIONS.filter((option) => value.includes(option.value))}
    options={SURFACE_OPTIONS}
    onValueChange={(newValue) => onChange(newValue.map((option) => option.value))}
    placeholder="Select surfaces"
    searchAriaLabel="Select surfaces"
    getOptionValue={(option) => option.value}
    getOptionLabel={(option) => option.label}
    isDisabled={isDisabled}
    isError={isError}
  />
);
