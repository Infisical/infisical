import { KeyboardEvent, ReactNode, useCallback } from "react";
import { SaveIcon, Undo2Icon } from "lucide-react";

import { IconButton } from "../../generic/IconButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../generic/Tooltip";
import { cn } from "../../utils";

const isMac =
  typeof navigator !== "undefined" ? /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) : false;

type SecretInputActionGroupProps = {
  children: ReactNode;
  className?: string;
};

const SecretInputActionGroup = ({ children, className }: SecretInputActionGroupProps) => (
  <div className={cn("flex items-center gap-1.5", className)}>{children}</div>
);

type SecretInputActionProps = {
  isDisabled?: boolean;
  label?: string;
  onClick: () => void;
};

const SecretInputSaveAction = ({
  isDisabled,
  label = "Save and Commit",
  onClick
}: SecretInputActionProps) => (
  <div>
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          aria-label={label}
          isDisabled={isDisabled}
          size="xs"
          variant="success"
          onClick={onClick}
        >
          <SaveIcon />
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  </div>
);

const SecretInputUndoAction = ({
  isDisabled,
  label = "Undo changes",
  onClick
}: SecretInputActionProps) => (
  <div>
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          aria-label={label}
          isDisabled={isDisabled}
          size="xs"
          variant="danger"
          onClick={onClick}
        >
          <Undo2Icon />
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  </div>
);

type SecretInputActionsProps = {
  className?: string;
  isSaveDisabled?: boolean;
  isUndoDisabled?: boolean;
  onSave: () => void;
  onUndo: () => void;
  saveLabel?: string;
  undoLabel?: string;
};

export const SecretInputActions = ({
  className,
  isSaveDisabled,
  isUndoDisabled,
  onSave,
  onUndo,
  saveLabel,
  undoLabel
}: SecretInputActionsProps) => (
  <SecretInputActionGroup className={className}>
    <SecretInputSaveAction isDisabled={isSaveDisabled} label={saveLabel} onClick={onSave} />
    <SecretInputUndoAction isDisabled={isUndoDisabled} label={undoLabel} onClick={onUndo} />
  </SecretInputActionGroup>
);

type UseSecretInputActionShortcutsProps = {
  isActive: boolean;
  isDisabled?: boolean;
  isSaveDisabled?: boolean;
  isUndoDisabled?: boolean;
  onSave: () => void;
  onUndo: () => void;
};

export const useSecretInputActionShortcuts = ({
  isActive,
  isDisabled,
  isSaveDisabled,
  isUndoDisabled,
  onSave,
  onUndo
}: UseSecretInputActionShortcutsProps) =>
  useCallback(
    (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const isShortcutModifierPressed = isMac ? event.metaKey : event.ctrlKey;

      if (!isShortcutModifierPressed || event.altKey || event.shiftKey || !isActive) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (!isDisabled && !isSaveDisabled) onSave();
      } else if (event.key.toLowerCase() === "u") {
        event.preventDefault();
        if (!isDisabled && !isUndoDisabled) onUndo();
      }
    },
    [isActive, isDisabled, isSaveDisabled, isUndoDisabled, onSave, onUndo]
  );
