import { useState } from "react";

export const useControllableState = <Value>({
  value,
  defaultValue,
  onChange
}: {
  value: Value | undefined;
  defaultValue: Value;
  onChange?: (value: Value) => void;
}) => {
  const [internal, setInternal] = useState(defaultValue);
  const current = value === undefined ? internal : value;
  const setValue = (next: Value) => {
    if (value === undefined) setInternal(next);
    if (next !== current) onChange?.(next);
  };
  return [current, setValue] as const;
};
