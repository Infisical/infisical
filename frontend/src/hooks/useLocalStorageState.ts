import { useCallback, useEffect, useSyncExternalStore } from "react";

type SetStateAction<T> = T | ((prevState: T) => T);

const dispatchStorageEvent = (key: string, newValue: string | null): void => {
  window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
};

const setLocalStorageItem = (key: string, value: unknown): void => {
  const stringifiedValue = JSON.stringify(value);
  window.localStorage.setItem(key, stringifiedValue);
  dispatchStorageEvent(key, stringifiedValue);
};

const removeLocalStorageItem = (key: string): void => {
  window.localStorage.removeItem(key);
  dispatchStorageEvent(key, null);
};

const getLocalStorageItem = (key: string): string | null => {
  return window.localStorage.getItem(key);
};

const useLocalStorageSubscribe = (callback: (e: StorageEvent) => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

const getLocalStorageServerSnapshot = (): never => {
  throw Error("useLocalStorage is a client-only hook");
};

export const useLocalStorageState = <T>(
  key: string,
  initialValue: T
): [T, (value: SetStateAction<T>) => void] => {
  const getSnapshot = () => getLocalStorageItem(key);

  const store = useSyncExternalStore(
    useLocalStorageSubscribe,
    getSnapshot,
    getLocalStorageServerSnapshot
  );

  const setState = useCallback(
    (v: SetStateAction<T>): void => {
      try {
        const nextState =
          typeof v === "function" ? (v as (prevState: T) => T)(JSON.parse(store || "null")) : v;

        if (nextState === undefined || nextState === null) {
          removeLocalStorageItem(key);
        } else {
          setLocalStorageItem(key, nextState);
        }
      } catch (e) {
        console.warn(e);
      }
    },
    [key, store]
  );

  useEffect(() => {
    if (getLocalStorageItem(key) === null && typeof initialValue !== "undefined") {
      setLocalStorageItem(key, initialValue);
    }
  }, [key, initialValue]);

  return [store ? JSON.parse(store) : initialValue, setState];
};
