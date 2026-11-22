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
  SheetTitle
} from "@app/components/v3";
import { HIDDEN_SECRET_VALUE_API_MASK } from "@app/const/secrets";

export type TUnsavedChange = {
  environment: string;
  environmentName: string;
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
  getChange: () => TUnsavedChange | null;
  settle: (committedValue: string) => void;
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
      getChange: () => editRef.current.getChange(),
      settle: (committedValue) => editRef.current.settle(committedValue),
      discard: () => editRef.current.discard()
    });
  }, [registry, isDirty, id]);
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
  const commitLabel = isSingleChange ? "Save Change" : `Commit ${count} Changes`;

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
        selectionLabel={`${count} pending change${isSingleChange ? "" : "s"}`}
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
          {commitLabel}
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
                  {commitLabel}
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
            <AlertDialogTitle>Update referenced secrets?</AlertDialogTitle>
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
              {commitLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
