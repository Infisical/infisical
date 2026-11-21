import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";

export type UnsavedEdit = { save: () => Promise<boolean>; discard: () => void };
type EditRef = { current: UnsavedEdit };
type UnsavedEditRegistry = { register: (edit: EditRef) => () => void };

export const UnsavedEditsContext = createContext<UnsavedEditRegistry | undefined>(undefined);

export const useUnsavedEdits = () => {
  const edits = useRef(new Set<EditRef>());
  const [count, setCount] = useState(0);
  const registry = useMemo<UnsavedEditRegistry>(
    () => ({
      register: (edit) => {
        edits.current.add(edit);
        setCount(edits.current.size);
        return () => {
          edits.current.delete(edit);
          setCount(edits.current.size);
        };
      }
    }),
    []
  );
  return { registry, count, list: () => [...edits.current].map((edit) => edit.current) };
};

export const useRegisterUnsavedEdit = (dirty: boolean, edit: UnsavedEdit) => {
  const registry = useContext(UnsavedEditsContext);
  const latest = useRef(edit);
  useLayoutEffect(() => {
    latest.current = edit;
  });
  useEffect(() => {
    if (!dirty || !registry) return undefined;
    return registry.register(latest);
  }, [dirty, registry]);
};
