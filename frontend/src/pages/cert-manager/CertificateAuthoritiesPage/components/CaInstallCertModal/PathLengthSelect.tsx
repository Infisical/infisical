import {
  FieldDescription,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { CaType, useGetCa } from "@app/hooks/api";

import { PATH_LENGTH_OPTIONS } from "./pathLengthOptions";

export const useLockedPathLength = (caId: string) => {
  const { data: ca } = useGetCa({ caId, type: CaType.INTERNAL });
  const storedPathLength =
    ca?.type === CaType.INTERNAL ? ca.configuration.maxPathLength : undefined;
  return typeof storedPathLength === "number" && storedPathLength >= 0
    ? storedPathLength
    : undefined;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  lockedPathLength?: number;
  isError?: boolean;
  placeholder?: string;
};

export const PathLengthSelect = ({
  value,
  onChange,
  lockedPathLength,
  isError,
  placeholder
}: Props) => {
  const isLocked = lockedPathLength !== undefined;

  return (
    <Select
      value={value}
      // Radix reports "" while a locked select mounts; keep the stored value.
      onValueChange={(next) => next && onChange(next)}
      disabled={isLocked}
    >
      <SelectTrigger className="w-full" isError={isError}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        {(isLocked ? [lockedPathLength] : PATH_LENGTH_OPTIONS).map((option) => (
          <SelectItem value={String(option)} key={`ca-path-length-${option}`}>
            {String(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export const PathLengthDescription = ({ isLocked }: { isLocked: boolean }) => (
  <FieldDescription>
    {isLocked
      ? "Matches this CA's current certificate and can't be changed."
      : "How many intermediate CAs may follow this CA in the chain. -1 means no limit."}
  </FieldDescription>
);
