import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

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
  // Only react to same-tab storage events (manually dispatched, storageArea is null).
  // Ignore cross-tab native storage events (storageArea is set) to prevent
  // other tabs from updating this tab's state.
  const handler = (e: StorageEvent) => {
    if (!e.storageArea) {
      callback(e);
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
};

const getLocalStorageServerSnapshot = (): never => {
  throw Error("useLocalStorage is a client-only hook");
};

// localStorage is writable by anything on the origin, so the stored string may not be
// valid JSON. Parsing happens during render, where a throw takes down the whole page
// instead of degrading to the initial value.
const parseStoredValue = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
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

  // Read through a ref so setState can fall back to the same value the caller sees without
  // taking initialValue as a dependency — callers commonly pass a fresh literal each render,
  // which would give setState a new identity every time.
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;

  const setState = useCallback(
    (v: SetStateAction<T>): void => {
      try {
        const nextState =
          typeof v === "function"
            ? (v as (prevState: T) => T)(parseStoredValue(store, initialValueRef.current))
            : v;

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

  return [parseStoredValue(store, initialValue), setState];
};
