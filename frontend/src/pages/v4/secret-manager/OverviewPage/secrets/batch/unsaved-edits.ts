import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";

import type { QuickAddAnnotations } from "../toolbar";

export type UnsavedChange = {
  projectId: string;
  environment: string;
  secretPath: string;
  secretKey: string;
  secretValue: string;
  originalValue: string;
  isCreate: boolean;
  annotations?: QuickAddAnnotations;
};
export type UnsavedEdit = {
  getChanges: () => UnsavedChange[];
  settle: (
    committed: UnsavedChange[],
    inReview: UnsavedChange[],
    submitted: UnsavedChange[]
  ) => void;
  discard: () => void;
};
type RegisteredEdit = UnsavedEdit & { held?: boolean };
type UnsavedEditRegistry = {
  register: (key: string, edit: UnsavedEdit) => (keepDraft: boolean) => void;
  getEdits: () => UnsavedEdit[];
  takeDraft: (key: string) => UnsavedChange[] | undefined;
  holdDrafts: (changes: UnsavedChange[]) => void;
  dropHeldDrafts: () => void;
  refresh: () => void;
  renameDraft: (
    projectId: string,
    environment: string,
    secretPath: string,
    from: string,
    to: string
  ) => "moved" | "conflict" | "none";
};
type UnsavedEditsState = {
  registry: UnsavedEditRegistry;
  keys: ReadonlySet<string>;
  committing: boolean;
};

export const draftKey = (
  projectId: string,
  environment: string,
  secretPath: string,
  secretKey: string
) => JSON.stringify([projectId, environment, secretPath, secretKey]);

export const changeKey = (change: UnsavedChange) =>
  draftKey(change.projectId, change.environment, change.secretPath, change.secretKey);

export const UnsavedEditsContext = createContext<UnsavedEditsState | undefined>(undefined);

export const useUnsavedEdits = () => {
  const edits = useRef(new Map<string, RegisteredEdit>());
  const [snapshot, setSnapshot] = useState<{ count: number; keys: ReadonlySet<string> }>({
    count: 0,
    keys: new Set()
  });
  const [committing, setCommitting] = useState(false);
  const registry = useMemo<UnsavedEditRegistry>(() => {
    const all = edits.current;
    const sync = () =>
      setSnapshot({
        count: [...all.values()].reduce((total, edit) => total + edit.getChanges().length, 0),
        keys: new Set(all.keys())
      });
    const hold = (key: string, changes: UnsavedChange[]) => {
      if (!changes.length) return;
      const held: RegisteredEdit = {
        getChanges: () => changes,
        settle: (committed, inReview) => {
          const remaining = changes.flatMap((change) => {
            const done = committed.find((entry) => changeKey(entry) === changeKey(change));
            if (!done) return [change];
            if (done.secretValue === change.secretValue) return [];
            if (inReview.some((entry) => changeKey(entry) === changeKey(change))) return [change];
            return [{ ...change, isCreate: false, originalValue: done.secretValue }];
          });
          if (all.get(key) === held) {
            all.delete(key);
            remaining.forEach((change) => hold(changeKey(change), [change]));
          }
          sync();
        },
        discard: () => {
          if (all.get(key) === held) all.delete(key);
          sync();
        },
        held: true
      };
      all.set(key, held);
    };
    return {
      register: (key, edit) => {
        all.set(key, edit);
        sync();
        return (keepDraft) => {
          if (all.get(key) !== edit) return;
          all.delete(key);
          if (keepDraft) hold(key, edit.getChanges());
          sync();
        };
      },
      getEdits: () =>
        [...all.entries()].map(([key, edit]) => ({
          getChanges: () => edit.getChanges(),
          settle: (
            committed: UnsavedChange[],
            inReview: UnsavedChange[],
            submitted: UnsavedChange[]
          ) => (all.get(key) ?? edit).settle(committed, inReview, submitted),
          discard: () => all.get(key)?.discard()
        })),
      takeDraft: (key) => {
        const edit = all.get(key);
        if (!edit?.held) return undefined;
        all.delete(key);
        sync();
        return edit.getChanges();
      },
      holdDrafts: (changes) => {
        changes.forEach((change) => {
          const key = changeKey(change);
          if (!all.has(key)) hold(key, [change]);
        });
        sync();
      },
      dropHeldDrafts: () => {
        all.forEach((edit, key) => {
          if (edit.held) all.delete(key);
        });
        sync();
      },
      refresh: sync,
      renameDraft: (projectId, environment, secretPath, from, to) => {
        const key = draftKey(projectId, environment, secretPath, from);
        const edit = all.get(key);
        if (!edit) return "none";
        const target = draftKey(projectId, environment, secretPath, to);
        all.delete(key);
        const existing = all.get(target);
        if (existing) {
          if (existing.held) {
            const [moved] = edit.getChanges();
            hold(
              target,
              existing.getChanges().map((change) => ({
                ...change,
                isCreate: false,
                originalValue: moved?.originalValue ?? change.originalValue
              }))
            );
          }
          sync();
          return "conflict";
        }
        hold(
          target,
          edit.getChanges().map((change) => ({ ...change, secretKey: to }))
        );
        sync();
        return "moved";
      }
    };
  }, []);
  const context = useMemo(
    () => ({ registry, keys: snapshot.keys, committing }),
    [registry, snapshot.keys, committing]
  );
  return {
    registry,
    context,
    count: snapshot.count,
    committing,
    setCommitting,
    changes: () => registry.getEdits().flatMap((edit) => edit.getChanges())
  };
};

export const useUnsavedEditsState = () => useContext(UnsavedEditsContext);

export const useHeldDraft = (key: string, restore: (draft: UnsavedChange[]) => void) => {
  const registry = useContext(UnsavedEditsContext)?.registry;
  const latest = useRef(restore);
  useLayoutEffect(() => {
    latest.current = restore;
  });
  useEffect(() => {
    const draft = registry?.takeDraft(key);
    if (draft) latest.current(draft);
  }, [registry, key]);
  return useCallback((changes: UnsavedChange[]) => registry?.holdDrafts(changes), [registry]);
};

export const useUnsavedEdit = (key: string | undefined, dirty: boolean, edit: UnsavedEdit) => {
  const state = useContext(UnsavedEditsContext);
  const registry = state?.registry;
  const latest = useRef(edit);
  const keep = useRef(dirty);
  const keyRef = useRef(key);
  useLayoutEffect(() => {
    latest.current = edit;
    keep.current = dirty;
    keyRef.current = key;
  });
  useEffect(() => {
    if (!registry || !key || !dirty) return undefined;
    const unregister = registry.register(key, {
      getChanges: () => latest.current.getChanges(),
      settle: (committed, inReview, submitted) =>
        latest.current.settle(committed, inReview, submitted),
      discard: () => latest.current.discard()
    });
    return () => unregister(keep.current && keyRef.current === key);
  }, [registry, key, dirty]);
  const changeTotal = key && dirty ? edit.getChanges().length : 0;
  useEffect(() => {
    if (changeTotal) registry?.refresh();
  }, [registry, changeTotal]);
  return {
    committing: Boolean(state?.committing),
    release: useCallback(() => {
      keep.current = false;
    }, [])
  };
};
