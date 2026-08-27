import {
  ClipboardEvent,
  CSSProperties,
  FormEvent,
  ReactNode,
  useEffect,
  useRef,
  useState
} from "react";

import { parsePastedEnv } from "@app/components/utilities/parseSecrets";
import {
  InfisicalSecretInput,
  Input,
  SecretInputActions,
  TableCell,
  TableRow,
  useSecretInputActionShortcuts
} from "@app/components/v3";
import { useProject } from "@app/context";

type TParsedEnv = Record<string, { value: string; comments: string[] }>;

type Props = {
  environments: string[];
  existingSecretKeys: string[];
  onCreateSecret: (
    environment: string,
    key: string,
    value: string,
    comment?: string
  ) => Promise<void>;
  onPasteSecrets: (env: TParsedEnv) => void;
  renderResourceTypeTrigger: (isDisabled: boolean) => ReactNode;
  saveLabel?: string;
  secretPath: string;
};

export const QuickAddSecretRow = ({
  environments,
  existingSecretKeys,
  onCreateSecret,
  onPasteSecrets,
  renderResourceTypeTrigger,
  saveLabel,
  secretPath
}: Props) => {
  const { currentProject } = useProject();
  const formRef = useRef<HTMLFormElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLTextAreaElement>(null);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [valueEditorStyle, setValueEditorStyle] = useState<CSSProperties>();
  const isMultiEnvironmentView = environments.length > 1;

  useEffect(() => {
    if (!isMultiEnvironmentView) {
      setValueEditorStyle(undefined);
      return undefined;
    }

    const nameCell = formRef.current?.closest("td");
    const tableContainer = formRef.current?.closest<HTMLElement>('[data-slot="table-container"]');
    if (!nameCell || !tableContainer) return undefined;

    const updateValueEditorStyle = () => {
      const containerRect = tableContainer.getBoundingClientRect();
      const nameCellRect = nameCell.getBoundingClientRect();
      const left = nameCellRect.right - containerRect.left;

      setValueEditorStyle({
        left,
        width: Math.max(tableContainer.clientWidth - left, 0)
      });
    };

    updateValueEditorStyle();

    const resizeObserver = new ResizeObserver(updateValueEditorStyle);
    resizeObserver.observe(nameCell);
    resizeObserver.observe(tableContainer);

    return () => resizeObserver.disconnect();
  }, [isMultiEnvironmentView]);

  const submitDraft = async () => {
    const normalizedKey = key.trim();

    if (!normalizedKey) {
      setError("Secret name is required");
      keyInputRef.current?.focus();
      return;
    }

    if (existingSecretKeys.includes(normalizedKey)) {
      setError("A secret with this name already exists");
      keyInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setError(undefined);

    try {
      await Promise.all(
        environments.map((environment) =>
          onCreateSecret(environment, normalizedKey, value, comment)
        )
      );
      setKey("");
      setValue("");
      setComment("");
    } finally {
      setIsSubmitting(false);
    }

    setTimeout(() => keyInputRef.current?.focus(), 0);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitDraft().catch(() => undefined);
  };

  const resetDraft = () => {
    setKey("");
    setValue("");
    setComment("");
    setError(undefined);
    setTimeout(() => keyInputRef.current?.focus(), 0);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const { selectionStart, selectionEnd } = event.currentTarget;
    const isReplacingWholeKey =
      !key || (selectionStart === 0 && selectionEnd === event.currentTarget.value.length);

    if (!isReplacingWholeKey) return;

    const parsedEnv = parsePastedEnv(event.clipboardData.getData("text"));
    const parsedEntries = Object.entries(parsedEnv);
    if (!parsedEntries.length) return;

    event.preventDefault();

    if (parsedEntries.length > 1) {
      onPasteSecrets(parsedEnv);
      return;
    }

    const [parsedKey, parsedSecret] = parsedEntries[0];
    setKey(currentProject?.autoCapitalization ? parsedKey.toUpperCase() : parsedKey);
    setValue(parsedSecret.value);
    setComment(parsedSecret.comments.join("\n"));
    setError(undefined);
    setTimeout(() => valueInputRef.current?.focus(), 0);
  };

  const isDraftActive = Boolean(key || value || comment);
  const requestSave = () => formRef.current?.requestSubmit();
  const handleActionShortcut = useSecretInputActionShortcuts({
    isActive: isDraftActive,
    isDisabled: isSubmitting,
    onSave: requestSave,
    onUndo: resetDraft
  });
  return (
    <TableRow className="group">
      <TableCell
        className={
          isMultiEnvironmentView
            ? "sticky left-0 z-10 w-10 max-w-10 min-w-10 bg-container px-2 group-hover:bg-container-hover"
            : "w-10 max-w-10 min-w-10 px-2"
        }
      >
        {renderResourceTypeTrigger(isDraftActive)}
      </TableCell>
      <TableCell
        className={
          isMultiEnvironmentView
            ? "sticky left-10 z-10 max-w-60 min-w-60 border-r bg-container group-hover:bg-container-hover lg:max-w-none lg:min-w-96"
            : "max-w-60 min-w-60 border-r lg:max-w-none lg:min-w-96"
        }
      >
        <form ref={formRef} id="quick-add-secret-form" onSubmit={handleSubmit}>
          <Input
            ref={keyInputRef}
            aria-describedby={error ? "quick-add-secret-error" : undefined}
            aria-label="New secret name"
            autoComplete="off"
            className="h-auto w-full rounded-none border-0 bg-transparent px-0 py-0 font-medium shadow-none placeholder:font-normal focus-visible:border-transparent focus-visible:ring-0"
            disabled={isSubmitting}
            isError={Boolean(error)}
            placeholder="Add a secret name"
            spellCheck={false}
            value={key}
            onPaste={handlePaste}
            onChange={(event) => {
              const nextKey = currentProject?.autoCapitalization
                ? event.currentTarget.value.toUpperCase()
                : event.currentTarget.value;
              setKey(nextKey);
              setError(undefined);
            }}
            onKeyDown={(event) => {
              handleActionShortcut(event);
              if (!event.defaultPrevented && event.key === "Enter") {
                event.preventDefault();
                valueInputRef.current?.focus();
              }
            }}
          />
          {error && (
            <span id="quick-add-secret-error" className="mt-1 block text-2xs text-danger">
              {error}
            </span>
          )}
        </form>
      </TableCell>
      <TableCell
        className={isMultiEnvironmentView ? "p-0" : undefined}
        colSpan={environments.length}
      >
        <div
          className={
            isMultiEnvironmentView
              ? "sticky z-[9] flex h-10 items-center bg-container px-3 group-hover:bg-container-hover"
              : "relative flex w-full items-center"
          }
          style={isMultiEnvironmentView ? valueEditorStyle : undefined}
        >
          <div className={isDraftActive ? "grow pr-16" : "grow"}>
            <InfisicalSecretInput
              ref={valueInputRef}
              aria-label="New secret value"
              environment={environments[0]}
              form="quick-add-secret-form"
              isDisabled={isSubmitting}
              placeholder={
                isMultiEnvironmentView
                  ? "Add a secret value (applies to all)"
                  : "Add a secret value"
              }
              secretPath={secretPath}
              value={value}
              variant="plain"
              onChange={setValue}
              onKeyDown={handleActionShortcut}
            />
          </div>
          {isDraftActive && (
            <SecretInputActions
              className="absolute right-0"
              isSaveDisabled={isSubmitting}
              isUndoDisabled={isSubmitting}
              saveLabel={saveLabel}
              onSave={requestSave}
              onUndo={resetDraft}
            />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
};
