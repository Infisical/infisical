import { useEffect, useState } from "react";

type TPersisntentStateReturn<T extends unknown> = [T, (val: T) => void];

export const usePersistentState = <T extends unknown>(
  initialValue: T,
  persistenceKey: string
): TPersisntentStateReturn<T> => {
  const [val, setVal] = useState<T>(initialValue);

  useEffect(() => {
    const temp = localStorage.getItem(persistenceKey);
    if (temp) {
      const { key } = JSON.parse(temp);
      setVal(key);
    }
  }, []);

  const setState = (state: T) => {
    localStorage.setItem(persistenceKey, JSON.stringify({ key: state }));
    setVal(state);
  };

  return [val, setState];
};
