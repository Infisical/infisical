import { useCallback, useState } from "react";

type VoidFn = () => void;

type UseToggleReturn = [
  boolean,
  {
    on: VoidFn;
    off: VoidFn;
    toggle: VoidFn;
    timedToggle: (timeout?: number) => void;
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

  const timedToggle = useCallback((timeout = 2000) => {
    setValue((prev) => !prev);

    setTimeout(() => {
      setValue(false);
    }, timeout);
  }, []);

  return [value, { on, off, toggle, timedToggle }];
};
