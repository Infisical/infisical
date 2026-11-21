import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { SaveIcon } from "lucide-react";

import { Button, SelectedActionBar } from "@app/components/v3";

type TUnsavedEdit = {
  save: () => Promise<boolean>;
  discard: () => void;
};

type TUnsavedEditsRegistry = {
  register: (id: string, edit: TUnsavedEdit) => () => void;
  getEdits: () => TUnsavedEdit[];
};

const UnsavedEditsRegistryContext = createContext<TUnsavedEditsRegistry | null>(null);
const UnsavedEditsCountContext = createContext(0);

export const UnsavedEditsScope = ({ children }: { children: ReactNode }) => {
  const editsRef = useRef(new Map<string, TUnsavedEdit>());
  const [count, setCount] = useState(0);

  const registry = useMemo<TUnsavedEditsRegistry>(
    () => ({
      register: (id, edit) => {
        editsRef.current.set(id, edit);
        setCount(editsRef.current.size);
        return () => {
          editsRef.current.delete(id);
          setCount(editsRef.current.size);
        };
      },
      getEdits: () => [...editsRef.current.values()]
    }),
    []
  );

  return (
    <UnsavedEditsRegistryContext.Provider value={registry}>
      <UnsavedEditsCountContext.Provider value={count}>
        {children}
      </UnsavedEditsCountContext.Provider>
    </UnsavedEditsRegistryContext.Provider>
  );
};

export const useUnsavedEdits = () => {
  const registry = useContext(UnsavedEditsRegistryContext);
  const count = useContext(UnsavedEditsCountContext);
  const getEdits = useCallback(() => registry?.getEdits() ?? [], [registry]);
  return { count, getEdits };
};

export const useUnsavedEdit = (isDirty: boolean, edit: TUnsavedEdit) => {
  const registry = useContext(UnsavedEditsRegistryContext);
  const id = useId();
  const editRef = useRef(edit);

  useLayoutEffect(() => {
    editRef.current = edit;
  });

  useEffect(() => {
    if (!registry || !isDirty) return undefined;
    return registry.register(id, {
      save: () => editRef.current.save(),
      discard: () => editRef.current.discard()
    });
  }, [registry, isDirty, id]);
};

type Props = {
  count: number;
  isSaving: boolean;
  portalContainer: HTMLElement | null;
  onSaveAll: () => void;
  onDiscardAll: () => void;
};

export const UnsavedEditsBar = ({
  count,
  isSaving,
  portalContainer,
  onSaveAll,
  onDiscardAll
}: Props) => (
  <SelectedActionBar
    portalContainer={portalContainer}
    positionerClassName={portalContainer ? "absolute bottom-4" : undefined}
    selectedCount={count}
    onClearSelection={() => {
      if (!isSaving) onDiscardAll();
    }}
    selectionLabel={`${count} unsaved change${count === 1 ? "" : "s"}`}
    clearLabel="Discard all"
    iconOnlyClear={false}
    aria-label="Unsaved change actions"
  >
    <Button
      variant="project"
      size="xs"
      onClick={onSaveAll}
      isDisabled={isSaving}
      isPending={isSaving}
    >
      <SaveIcon />
      Save all
    </Button>
  </SelectedActionBar>
);
