import { useCallback, useState } from "react";

type VoidFn = () => void;

type UseToggleReturn = [
  boolean,
  {
    on: VoidFn;
    off: VoidFn;
    toggle: VoidFn;
  }
];

export const useToggle = (initialState = false): UseToggleReturn => {
  const [value, setValue] = useState(initialState);

  const on = useCallback(() => {
    setValue(true);
  }, []);

  const off = useCallback(() => {
    setValue(false);
  }, []);

  const toggle = useCallback((isOpen?: boolean) => {
    setValue((prev) => (typeof isOpen === "boolean" ? isOpen : !prev));
  }, []);

  return [value, { on, off, toggle }];
};
