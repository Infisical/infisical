import { useLayoutEffect, useRef } from "react";

export const useLastDefined = <T>(value: T | undefined) => {
  const last = useRef(value);
  useLayoutEffect(() => {
    if (value !== undefined) last.current = value;
  });
  return value ?? last.current;
};
