import {
  ClipboardEvent,
  CSSProperties,
  FormEvent,
  ReactNode,
  useEffect,
  useRef,
  useState
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { parsePastedEnv } from "@app/components/utilities/parseSecrets";
import {
  InfisicalSecretInput,
  Input,
  SecretInputActions,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useSecretInputActionShortcuts
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useDebounce } from "@app/hooks";
import {
  secretKeyExistsQueryOptions,
  useGetSecretKeyExistingEnvironments
} from "@app/hooks/api/dashboard/queries";

import { overviewCountBucket, useOverviewTelemetry } from "../../OverviewTelemetry";
import { TABLE_ROW_ACTIVE_FILTER_CLASS_NAME } from "../tableRowActionStyles";
import type { TableRowActivityChangeHandler, TableRowActivityId } from "../tableRowActivity";

type TParsedEnv = Record<string, { value: string; comments: string[] }>;

const getDuplicateKeyError = (environmentsWithKey: string[], isMultiEnvironmentView: boolean) =>
  isMultiEnvironmentView
    ? `A secret with this name already exists in ${environmentsWithKey.join(", ")}`
    : "A secret with this name already exists";

const LISTED_ENVIRONMENT_COUNT = 2;

const DuplicateEnvironmentsMessage = ({ environments }: { environments: string[] }) => {
  const listedEnvironments = environments.slice(0, LISTED_ENVIRONMENT_COUNT).join(", ");
  const hiddenEnvironments = environments.slice(LISTED_ENVIRONMENT_COUNT);
  if (!hiddenEnvironments.length) return <>Already exists in {listedEnvironments}</>;

  return (
    <>
      Already exists in {listedEnvironments} and{" "}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="cursor-default rounded-sm underline decoration-dotted underline-offset-2 outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {hiddenEnvironments.length} more
          </button>
        </TooltipTrigger>
        <TooltipContent>{hiddenEnvironments.join(", ")}</TooltipContent>
      </Tooltip>
    </>
  );
};

type Props = {
  autoQueueOnBlur?: boolean;
  environments: string[];
  existingSecretKeys: string[];
  onCreateSecret: (
    environment: string,
    key: string,
    value: string,
    comment?: string,
    isDirectSave?: boolean
  ) => Promise<void>;
  onPasteSecrets: (env: TParsedEnv) => void;
  onQueuedSecretConflict?: (draft: { key: string; value: string; comment: string }) => boolean;
  renderResourceTypeTrigger: (isDisabled: boolean) => ReactNode;
  saveLabel?: string;
  secretPath: string;
  activityId: TableRowActivityId;
  onActivityChange: TableRowActivityChangeHandler;
};

export const QuickAddSecretRow = ({
  autoQueueOnBlur = false,
  environments,
  existingSecretKeys,
  onCreateSecret,
  onPasteSecrets,
  onQueuedSecretConflict,
  renderResourceTypeTrigger,
  saveLabel,
  secretPath,
  activityId,
  onActivityChange
}: Props) => {
  const telemetry = useOverviewTelemetry();
  const { currentProject } = useProject();
  const rowRef = useRef<HTMLTableRowElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLTextAreaElement>(null);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const [isActive, setIsActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [valueEditorStyle, setValueEditorStyle] = useState<CSSProperties>();
  const isMultiEnvironmentView = environments.length > 1;
  const queryClient = useQueryClient();
  const latestDraftRef = useRef({ key, value, comment });
  latestDraftRef.current = { key, value, comment };
  const trimmedKey = key.trim();
  const [debouncedKey] = useDebounce(trimmedKey, 500);
  const isLocalDuplicate = existingSecretKeys.includes(trimmedKey);
  const { data: environmentsWithKey } = useGetSecretKeyExistingEnvironments(
    { projectId: currentProject.id, environments, secretPath, secretKey: debouncedKey },
    { enabled: !existingSecretKeys.includes(debouncedKey) }
  );
  const isCheckForCurrentKey = Boolean(trimmedKey) && debouncedKey === trimmedKey;
  let duplicateError: string | undefined;
  if (isLocalDuplicate) duplicateError = "A secret with this name already exists";
  else if (isCheckForCurrentKey && environmentsWithKey?.length)
    duplicateError = getDuplicateKeyError(environmentsWithKey, isMultiEnvironmentView);
  const isKeyConfirmedFree = isCheckForCurrentKey && environmentsWithKey?.length === 0;
  const duplicateEnvironments =
    isMultiEnvironmentView &&
    !isLocalDuplicate &&
    isCheckForCurrentKey &&
    environmentsWithKey?.length
      ? environmentsWithKey
      : undefined;
  const displayedError = error ?? duplicateError;

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
        width: Math.max(tableContainer.clientWidth - left, 240)
      });
    };

    updateValueEditorStyle();

    const resizeObserver = new ResizeObserver(updateValueEditorStyle);
    resizeObserver.observe(nameCell);
    resizeObserver.observe(tableContainer);

    return () => resizeObserver.disconnect();
  }, [isMultiEnvironmentView]);

  useEffect(() => {
    onActivityChange(activityId, isActive);
  }, [activityId, isActive, onActivityChange]);

  useEffect(
    () => () => {
      onActivityChange(activityId, false);
    },
    [activityId, onActivityChange]
  );

  const submitDraft = async ({
    refocus = true,
    isDirectSave = true
  }: { refocus?: boolean; isDirectSave?: boolean } = {}) => {
    const normalizedKey = key.trim();

    if (!normalizedKey) {
      setError("Secret name is required");
      if (refocus) keyInputRef.current?.focus();
      return;
    }

    if (duplicateError) {
      if (refocus) keyInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setError(undefined);

    try {
      if (isDirectSave) {
        const takenEnvironments = await queryClient
          .fetchQuery(
            secretKeyExistsQueryOptions({
              projectId: currentProject.id,
              environments,
              secretPath,
              secretKey: normalizedKey
            })
          )
          .catch(() => []);
        if (takenEnvironments.length) {
          if (refocus) setTimeout(() => keyInputRef.current?.focus(), 0);
          return;
        }
      }

      await Promise.all(
        environments.map((environment) =>
          onCreateSecret(environment, normalizedKey, value, comment, isDirectSave)
        )
      );
      if (!isDirectSave && !isKeyConfirmedFree) {
        const queuedDraft = { key: normalizedKey, value, comment };
        queryClient
          .fetchQuery(
            secretKeyExistsQueryOptions({
              projectId: currentProject.id,
              environments,
              secretPath,
              secretKey: normalizedKey
            })
          )
          .catch(() => [])
          .then((takenEnvironments) => {
            if (!takenEnvironments.length || !onQueuedSecretConflict?.(queuedDraft)) return;
            const duplicateKeyError = getDuplicateKeyError(
              takenEnvironments,
              isMultiEnvironmentView
            );
            createNotification({
              type: "error",
              text: `${duplicateKeyError}, so '${queuedDraft.key}' was removed from your pending changes`
            });
            const latestDraft = latestDraftRef.current;
            if (latestDraft.key || latestDraft.value || latestDraft.comment) return;
            setKey(queuedDraft.key);
            setValue(queuedDraft.value);
            setComment(queuedDraft.comment);
          });
      }
      setKey("");
      setValue("");
      setComment("");
      setError(undefined);
      const { activeElement } = document;
      if (activeElement instanceof HTMLElement && rowRef.current?.contains(activeElement)) {
        activeElement.blur();
      }
      setIsActive(false);
    } finally {
      setIsSubmitting(false);
    }
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
    if (parsedEntries.length === 1)
      telemetry.flow({
        action: "create",
        resourceType: "secret",
        source: "paste",
        phase: "input-received",
        countBucket: overviewCountBucket(parsedEntries.length)
      });

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
    <TableRow
      ref={rowRef}
      className={isActive ? `group ${TABLE_ROW_ACTIVE_FILTER_CLASS_NAME}` : "group"}
      onFocusCapture={() => setIsActive(true)}
      onMouseDown={(event) => {
        if (!(event.target as HTMLElement).closest("input, textarea, button, a, [tabindex]"))
          event.preventDefault();
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsActive(false);
        }

        if (
          !autoQueueOnBlur ||
          !isDraftActive ||
          isSubmitting ||
          !key.trim() ||
          event.currentTarget.contains(event.relatedTarget as Node | null)
        ) {
          return;
        }

        submitDraft({ refocus: false, isDirectSave: false }).catch(() => undefined);
      }}
    >
      <TableCell
        isTopAligned
        className={
          isMultiEnvironmentView
            ? "sticky left-0 z-10 w-10 max-w-10 min-w-10 bg-container p-0 group-hover:bg-container-hover"
            : "w-10 max-w-10 min-w-10 p-0"
        }
      >
        <div className="flex h-10 items-center justify-center">
          {renderResourceTypeTrigger(isDraftActive)}
        </div>
      </TableCell>
      <TableCell
        isTopAligned
        className={
          isMultiEnvironmentView
            ? "sticky left-10 z-10 w-60 max-w-60 min-w-60 border-r bg-container group-hover:bg-container-hover lg:w-96 lg:max-w-96 lg:min-w-96"
            : "w-60 max-w-60 min-w-60 border-r lg:w-96 lg:max-w-96 lg:min-w-96"
        }
      >
        <form ref={formRef} id="quick-add-secret-form" onSubmit={handleSubmit}>
          <div className="flex min-h-7 items-center">
            <Input
              ref={keyInputRef}
              aria-describedby={displayedError ? "quick-add-secret-error" : undefined}
              aria-label="New secret name"
              autoComplete="off"
              className="h-auto w-full rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:border-transparent focus-visible:ring-0"
              disabled={isSubmitting}
              isError={Boolean(displayedError)}
              placeholder="Add a secret name or paste a .env"
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
          </div>
          {displayedError && (
            <span
              id="quick-add-secret-error"
              className="block text-2xs break-words whitespace-normal text-danger"
            >
              {!error && duplicateEnvironments ? (
                <DuplicateEnvironmentsMessage environments={duplicateEnvironments} />
              ) : (
                displayedError
              )}
            </span>
          )}
        </form>
      </TableCell>
      <TableCell
        isTopAligned
        className={isMultiEnvironmentView ? "p-0" : undefined}
        colSpan={environments.length}
      >
        <div
          className={
            isMultiEnvironmentView
              ? "sticky z-[9] flex min-h-10 items-start bg-container px-3 py-1.5 group-hover:bg-container-hover"
              : "relative flex w-full items-start"
          }
          style={isMultiEnvironmentView ? valueEditorStyle : undefined}
        >
          <div className={isDraftActive ? "grow py-1 pr-16" : "grow py-1"}>
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
              className={
                isMultiEnvironmentView ? "absolute top-1.5 right-0" : "absolute top-0 right-0"
              }
              isSaveDisabled={isSubmitting || Boolean(duplicateError)}
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
