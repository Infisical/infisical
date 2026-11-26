import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { ClipboardCheckIcon, EyeIcon, SaveIcon } from "lucide-react";

import { SecretVersionDiffView } from "@app/components/secrets/diff";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Badge,
  Button,
  Input,
  SelectedActionBar,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { HIDDEN_SECRET_VALUE_API_MASK } from "@app/const/secrets";

export type TUnsavedChange = {
  environment: string;
  environmentName: string;
  secretPath: string;
  secretKey: string;
  secretValue: string;
  originalValue: string | null;
  secretValueHidden: boolean;
  isCreate: boolean;
  isReferenced: boolean;
  secretComment?: string;
  tagIds?: string[];
};
type TUnsavedEdit = {
  getChanges: () => TUnsavedChange[];
  settle: (committed: TUnsavedChange[], reviewEnvironments: string[]) => void;
  discard: () => void;
};

type TRegisteredEdit = TUnsavedEdit & { isHeld?: boolean };

type TUnsavedEditsRegistry = {
  register: (key: string, edit: TUnsavedEdit) => (keepDraft: boolean) => void;
  getEdits: () => TUnsavedEdit[];
  takeDraft: (key: string) => TUnsavedChange[] | undefined;
  holdDrafts: (changes: TUnsavedChange[]) => void;
  dropHeldDrafts: () => void;
  renameHeldDraft: (
    environment: string,
    secretPath: string,
    from: string,
    to: string
  ) => "moved" | "conflict" | "none";
  setCommitting: (isCommitting: boolean) => void;
};

export const getUnsavedDraftKey = (environment: string, secretPath: string, secretKey: string) =>
  JSON.stringify([environment, secretPath, secretKey]);

const UnsavedEditsRegistryContext = createContext<TUnsavedEditsRegistry | null>(null);
const UnsavedEditsCountContext = createContext(0);
const UnsavedEditsKeysContext = createContext<ReadonlySet<string>>(new Set());
const UnsavedEditsCommittingContext = createContext(false);

export const UnsavedEditsScope = ({ children }: { children: ReactNode }) => {
  const editsRef = useRef(new Map<string, TRegisteredEdit>());
  const [snapshot, setSnapshot] = useState({ count: 0, keys: new Set<string>() });
  const [isCommitting, setCommitting] = useState(false);

  const registry = useMemo<TUnsavedEditsRegistry>(() => {
    const edits = editsRef.current;
    const sync = () =>
      setSnapshot({
        count: [...edits.values()].reduce((total, edit) => total + edit.getChanges().length, 0),
        keys: new Set(edits.keys())
      });
    const hold = (key: string, changes: TUnsavedChange[]) => {
      if (!changes.length) return;
      const held: TRegisteredEdit = {
        getChanges: () => changes,
        settle: (committed, reviewEnvironments) => {
          const remaining = changes.flatMap((change) => {
            const done = committed.find(
              ({ environment, secretKey }) =>
                environment === change.environment && secretKey === change.secretKey
            );
            if (!done) return [change];
            if (done.secretValue === change.secretValue) return [];
            if (reviewEnvironments.includes(change.environment)) return [change];
            return [{ ...change, isCreate: false, originalValue: done.secretValue }];
          });
          if (edits.get(key) === held) {
            edits.delete(key);
            remaining.forEach((change) =>
              hold(getUnsavedDraftKey(change.environment, change.secretPath, change.secretKey), [
                change
              ])
            );
          }
          sync();
        },
        discard: () => {
          if (edits.get(key) === held) edits.delete(key);
          sync();
        },
        isHeld: true
      };
      edits.set(key, held);
    };
    return {
      register: (key, edit) => {
        edits.set(key, edit);
        sync();
        return (keepDraft) => {
          if (edits.get(key) !== edit) return;
          edits.delete(key);
          if (keepDraft) hold(key, edit.getChanges());
          sync();
        };
      },
      getEdits: () =>
        [...edits.entries()].map(([key, edit]) => ({
          getChanges: () => edit.getChanges(),
          settle: (committed: TUnsavedChange[], reviewEnvironments: string[]) =>
            (edits.get(key) ?? edit).settle(committed, reviewEnvironments),
          discard: () => edits.get(key)?.discard()
        })),
      takeDraft: (key) => {
        const edit = edits.get(key);
        if (!edit?.isHeld) return undefined;
        edits.delete(key);
        sync();
        return edit.getChanges();
      },
      holdDrafts: (changes) => {
        changes.forEach((change) =>
          hold(getUnsavedDraftKey(change.environment, change.secretPath, change.secretKey), [
            change
          ])
        );
        sync();
      },
      renameHeldDraft: (environment, secretPath, from, to) => {
        const key = getUnsavedDraftKey(environment, secretPath, from);
        const edit = edits.get(key);
        if (!edit?.isHeld) return "none";
        const target = getUnsavedDraftKey(environment, secretPath, to);
        edits.delete(key);
        const existing = edits.get(target);
        if (existing) {
          if (existing.isHeld) {
            const [moved] = edit.getChanges();
            hold(
              target,
              existing.getChanges().map((change) => ({
                ...change,
                isCreate: false,
                originalValue: moved?.originalValue ?? null,
                isReferenced: change.isReferenced || Boolean(moved?.isReferenced)
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
      },
      dropHeldDrafts: () => {
        edits.forEach((edit, key) => {
          if (edit.isHeld) edits.delete(key);
        });
        sync();
      },
      setCommitting
    };
  }, []);

  return (
    <UnsavedEditsRegistryContext.Provider value={registry}>
      <UnsavedEditsCountContext.Provider value={snapshot.count}>
        <UnsavedEditsKeysContext.Provider value={snapshot.keys}>
          <UnsavedEditsCommittingContext.Provider value={isCommitting}>
            {children}
          </UnsavedEditsCommittingContext.Provider>
        </UnsavedEditsKeysContext.Provider>
      </UnsavedEditsCountContext.Provider>
    </UnsavedEditsRegistryContext.Provider>
  );
};

export const useUnsavedEdits = () => {
  const registry = useContext(UnsavedEditsRegistryContext);
  const count = useContext(UnsavedEditsCountContext);
  const isCommitting = useContext(UnsavedEditsCommittingContext);
  const getEdits = useCallback(() => registry?.getEdits() ?? [], [registry]);
  const setCommitting = useCallback((value: boolean) => registry?.setCommitting(value), [registry]);
  const dropHeldDrafts = useCallback(() => registry?.dropHeldDrafts(), [registry]);
  return { count, getEdits, isCommitting, setCommitting, dropHeldDrafts };
};

export const useUnsavedDraftKeys = () => useContext(UnsavedEditsKeysContext);

export const useRenameHeldDraft = () => {
  const registry = useContext(UnsavedEditsRegistryContext);
  return useCallback(
    (environment: string, secretPath: string, from: string, to: string) =>
      registry?.renameHeldDraft(environment, secretPath, from, to) ?? "none",
    [registry]
  );
};

export const useUnsavedEdit = (
  key: string,
  isDirty: boolean,
  edit: TUnsavedEdit & { restore: (draft: TUnsavedChange[]) => void },
  size = 1
) => {
  const registry = useContext(UnsavedEditsRegistryContext);
  const editRef = useRef(edit);
  const isDirtyRef = useRef(isDirty);
  const keyRef = useRef(key);

  useLayoutEffect(() => {
    editRef.current = edit;
    isDirtyRef.current = isDirty;
    keyRef.current = key;
  });

  useEffect(() => {
    const draft = registry?.takeDraft(key);
    if (draft) editRef.current.restore(draft);
  }, [registry, key]);

  useEffect(() => {
    if (!registry || !isDirty) return undefined;
    const unregister = registry.register(key, {
      getChanges: () => editRef.current.getChanges(),
      settle: (committed, reviewEnvironments) =>
        editRef.current.settle(committed, reviewEnvironments),
      discard: () => editRef.current.discard()
    });
    return () => unregister(isDirtyRef.current && keyRef.current === key);
  }, [registry, isDirty, key, size]);

  return {
    isCommitting: useContext(UnsavedEditsCommittingContext),
    holdDrafts: useCallback(
      (changes: TUnsavedChange[]) => registry?.holdDrafts(changes),
      [registry]
    )
  };
};

type Props = {
  count: number;
  isCommitting: boolean;
  portalContainer: HTMLElement | null;
  getChanges: () => TUnsavedChange[];
  onCommit: (message: string) => Promise<boolean>;
  onDiscardAll: () => void;
};

export const UnsavedEditsBar = ({
  count,
  isCommitting,
  portalContainer,
  getChanges,
  onCommit,
  onDiscardAll
}: Props) => {
  const [reviewChanges, setReviewChanges] = useState<TUnsavedChange[] | null>(null);
  const [referencedChanges, setReferencedChanges] = useState<TUnsavedChange[] | null>(null);
  const [message, setMessage] = useState("");
  const isSingleChange = count === 1;

  const commit = async () => {
    if (isCommitting || !(await onCommit(message))) return;
    setReferencedChanges(null);
    setReviewChanges(null);
    setMessage("");
  };

  const handleCommit = () => {
    const referenced = getChanges().filter((change) => change.isReferenced);
    if (referenced.length) {
      setReferencedChanges(referenced);
      return;
    }
    commit();
  };

  const countByEnvironmentName = new Map<string, number>();
  getChanges().forEach(({ environmentName }) => {
    countByEnvironmentName.set(
      environmentName,
      (countByEnvironmentName.get(environmentName) ?? 0) + 1
    );
  });

  const changesByEnvironment = new Map<string, TUnsavedChange[]>();
  (reviewChanges ?? []).forEach((change) => {
    changesByEnvironment.set(change.environment, [
      ...(changesByEnvironment.get(change.environment) ?? []),
      change
    ]);
  });

  return (
    <>
      <SelectedActionBar
        portalContainer={portalContainer}
        positionerClassName={portalContainer ? "absolute bottom-4" : undefined}
        selectedCount={reviewChanges ? 0 : count}
        onClearSelection={() => {
          if (!isCommitting) onDiscardAll();
        }}
        clearOnEscape={false}
        selectionLabel={
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{`${count} pending change${isSingleChange ? "" : "s"}`}</span>
            </TooltipTrigger>
            <TooltipContent>
              {[...countByEnvironmentName].map(([environmentName, environmentCount]) => (
                <div key={environmentName} className="flex justify-between gap-4">
                  <span>{environmentName}</span>
                  <span className="text-muted">{environmentCount}</span>
                </div>
              ))}
            </TooltipContent>
          </Tooltip>
        }
        clearLabel="Discard"
        iconOnlyClear={false}
        aria-label="Pending change actions"
      >
        <Button variant="outline" size="xs" onClick={() => setReviewChanges(getChanges())}>
          <EyeIcon />
          Review
        </Button>
        <Button
          variant="project"
          size="xs"
          onClick={handleCommit}
          isDisabled={isCommitting}
          isPending={isCommitting}
        >
          <SaveIcon />
          Save
        </Button>
      </SelectedActionBar>

      <Sheet open={Boolean(reviewChanges)} onOpenChange={(open) => !open && setReviewChanges(null)}>
        <SheetContent size="wide" isPending={isCommitting} className="gap-y-0">
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center gap-2">
              Review Changes
              <Badge variant="warning">
                <ClipboardCheckIcon />
                {count} Change{isSingleChange ? "" : "s"}
              </Badge>
            </SheetTitle>
            <SheetDescription>
              Each environment gets its own commit. Environments with a change policy open a change
              request instead.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
            {[...changesByEnvironment.entries()].map(([environment, changes]) => (
              <div key={environment}>
                <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
                  <span className="flex-1 text-sm font-medium">{changes[0].environmentName}</span>
                  <Badge variant="neutral">{changes.length}</Badge>
                </div>
                <div className="space-y-2">
                  {changes.map((change) => {
                    const newVersion = {
                      version: 2,
                      secretKey: change.secretKey,
                      secretValue: change.secretValue
                    };
                    return (
                      <SecretVersionDiffView
                        key={`${change.environment}:${change.secretKey}`}
                        showViewed
                        item={{
                          id: `${change.environment}:${change.secretKey}`,
                          type: "secret",
                          secretKey: change.secretKey,
                          isAdded: change.isCreate,
                          isUpdated: !change.isCreate,
                          versions: change.isCreate
                            ? [newVersion]
                            : [
                                {
                                  version: 1,
                                  secretKey: change.secretKey,
                                  secretValue: change.secretValueHidden
                                    ? HIDDEN_SECRET_VALUE_API_MASK
                                    : (change.originalValue ?? ""),
                                  secretValueHidden: change.secretValueHidden
                                },
                                newVersion
                              ]
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <SheetFooter className="border-t border-border">
            <div className="flex w-full flex-col gap-4">
              {!isSingleChange && (
                <Input
                  aria-label="Commit message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your changes..."
                  maxLength={255}
                />
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setReviewChanges(null)}
                  isDisabled={isCommitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="project"
                  onClick={handleCommit}
                  isPending={isCommitting}
                  isDisabled={isCommitting}
                >
                  <SaveIcon />
                  Save
                </Button>
              </div>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        isPending={isCommitting}
        open={Boolean(referencedChanges)}
        onOpenChange={(open) => !open && setReferencedChanges(null)}
        confirmationValue="confirm"
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <SaveIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Update Referenced Secrets?</AlertDialogTitle>
            <AlertDialogDescription>
              Other secrets in your project reference{" "}
              {referencedChanges?.length === 1 ? "this secret" : "these secrets"}. Committing
              updates them everywhere they&apos;re referenced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1 text-sm">
            {referencedChanges?.map((change) => (
              <li key={`${change.environment}:${change.secretKey}`} className="flex gap-2">
                <code>{change.secretKey}</code>
                <span className="text-muted">{change.environmentName}</span>
              </li>
            ))}
          </ul>
          <AlertDialogConfirmationField />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="project"
              onClick={(e) => {
                e.preventDefault();
                commit();
              }}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
