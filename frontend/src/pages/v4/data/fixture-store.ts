import { useSyncExternalStore } from "react";

export const createFixtureStore = <T>(initial: T) => {
  let state = initial;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const get = () => state;
  return {
    get,
    update: (change: (current: T) => T) => {
      state = change(state);
      listeners.forEach((listener) => listener());
    },
    use: () => useSyncExternalStore(subscribe, get)
  };
};

export const fixtureMutation =
  <TVariables, TData>(run: (variables: TVariables) => TData) =>
  () => ({ mutateAsync: async (variables: TVariables) => run(variables), isPending: false });
