import { Dispatch, SetStateAction, useEffect, useState } from "react";

type Props<T> = {
  initialState: T;
  delay?: number;
};

// this hook is used when you need to reset the state to previous one after a particular time
// usecase#1: To make copy to copied and back to copy in clipboard operation
export const useTimedReset = <T extends string | number | boolean>({
  delay = 2000,
  initialState
}: Props<T>): [T, boolean, Dispatch<SetStateAction<T>>] => {
  const [state, setState] = useState<T>(initialState);
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (state !== initialState) {
      timer = setTimeout(() => setState(initialState), delay);
    }
    return () => clearTimeout(timer);
  }, [state]);

  // state, isChaning, setState
  return [state, state !== initialState, setState];
};
