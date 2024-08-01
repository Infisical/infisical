import { useEffect, useMemo, useRef } from "react";

type AnyFunction = (...args: any[]) => any;

// Sometimes, developers forget to memoize a callback that they pass to the component.
// This hook is intended to avoid re-rendering caused by callback function prop by adding a bit of overhead.
export function useCallbackRef<TFunc extends AnyFunction>(callback: TFunc): TFunc {
  const callbackRef = useRef<TFunc>(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useMemo(() => 
    ((...args: Parameters<TFunc>): ReturnType<TFunc> => 
      callbackRef.current(...args)
    ) as TFunc,
  []);
}