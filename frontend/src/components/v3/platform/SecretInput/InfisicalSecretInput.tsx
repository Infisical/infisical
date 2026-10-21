import { forwardRef, TextareaHTMLAttributes, useCallback, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject, useProjectPermission, useSubscription } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";

import { SecretInput, SecretInputVariant } from "./SecretInput";
import { SecretReferenceWizard } from "./SecretReferenceWizard";

const getIndexOfUnclosedRefToTheLeft = (value: string, pos: number) => {
  for (let i = pos; i >= 1; i -= 1) {
    if (value[i] === "}") return -1;
    if (value[i - 1] === "$" && value[i] === "{") {
      return i;
    }
  }
  return -1;
};

const getIndexOfUnclosedRefToTheRight = (value: string, pos: number) => {
  for (let i = pos; i < value.length; i += 1) {
    if (value[i] === "}") return i - 1;
  }
  return -1;
};

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  value?: string | null;
  onChange: (val: string) => void;
  variant?: SecretInputVariant;
  isImport?: boolean;
  isVisible?: boolean;
  isReadOnly?: boolean;
  isDisabled?: boolean;
  canEditButNotView?: boolean;
  secretPath?: string;
  environment?: string;
  containerClassName?: string;
  isLoadingValue?: boolean;
  isErrorLoadingValue?: boolean;
};

export const InfisicalSecretInput = forwardRef<HTMLTextAreaElement, Props>(
  (
    {
      value: propValue,
      onChange,
      containerClassName,
      secretPath: propSecretPath,
      environment: propEnvironment,
      canEditButNotView,
      ...props
    },
    ref
  ) => {
    const value = propValue ?? "";
    const { currentProject } = useProject();
    const { currentOrg } = useOrganization();
    const { subscription } = useSubscription();
    const projectId = currentProject?.id || "";
    const navigate = useNavigate({ from: ROUTE_PATHS.SecretManager.OverviewPage.path });
    const { permission } = useProjectPermission();

    const canCrossProjectShare =
      subscription?.crossProjectSecretSharing && currentOrg?.allowCrossProjectSecretSharing;

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [isSuggestionActive, setIsSuggestionActive] = useState(false);
    const [cursorPosition, setCursorPosition] = useState(0);

    const openRefLeft = getIndexOfUnclosedRefToTheLeft(value, cursorPosition - 1);

    const referenceContent = openRefLeft !== -1 ? value.slice(openRefLeft + 1, cursorPosition) : "";

    // Don't open the wizard for cross-project references when cross-project
    // sharing is unavailable (e.g. after a license downgrade).
    const isCrossProjectRefWithoutAccess =
      referenceContent.startsWith("@") && !canCrossProjectShare;

    const isPopupOpen = openRefLeft !== -1 && isSuggestionActive && !isCrossProjectRefWithoutAccess;

    const replaceReferenceContent = (content: string, shouldCloseReference: boolean) => {
      const left = openRefLeft + 1; // position right after ${
      const rightBracketIndex = getIndexOfUnclosedRefToTheRight(value, left);
      const isEnclosed = rightBracketIndex !== -1;

      const lhsValue = value.slice(0, left);
      const rhsValue = value.slice(isEnclosed ? rightBracketIndex + 1 : cursorPosition);

      const closingBracket = shouldCloseReference && !isEnclosed ? "}" : "";
      onChange?.(`${lhsValue}${content}${closingBracket}${rhsValue}`);

      const nextCursorPosition = lhsValue.length + content.length + (shouldCloseReference ? 1 : 0);
      setCursorPosition(nextCursorPosition);
      const delay = setTimeout(() => {
        clearTimeout(delay);
        if (inputRef.current) {
          inputRef.current.selectionStart = nextCursorPosition;
          inputRef.current.selectionEnd = nextCursorPosition;
        }
      }, 10);
    };

    const handleWizardSelect = (selectedReference: string) => {
      replaceReferenceContent(selectedReference, true);
      setIsSuggestionActive(false);
    };

    const handleRef = useCallback(
      (el: HTMLTextAreaElement) => {
        inputRef.current = el;
        if (ref) {
          if (typeof ref === "function") {
            ref(el);
          } else {
            // eslint-disable-next-line
            ref.current = el;
          }
        }
      },
      [ref]
    );

    const handleClickSegment = useCallback(
      (segment: string, allSegments: string[]) => {
        if (!projectId) {
          createNotification({ text: "Project ID is not set", type: "error" });
          return;
        }

        if (allSegments.length === 0) {
          createNotification({ text: "Invalid secret reference", type: "error" });
          return;
        }

        // Cross-project references (start with @) are not navigable yet
        if (allSegments[0]?.startsWith("@")) return;

        if (allSegments.length === 1) {
          const canReadSecretValue = hasSecretReadValueOrDescribePermission(
            permission,
            ProjectPermissionSecretActions.ReadValue,
            {
              environment: propEnvironment ?? "*",
              secretPath: propSecretPath ?? "/",
              secretName: segment,
              secretTags: ["*"]
            }
          );

          if (!canReadSecretValue) {
            createNotification({
              text: "You do not have permission to access this secret",
              type: "error"
            });
            return;
          }

          navigate({
            search: (prev) => ({
              ...prev,
              search: segment,
              filterBy: "secret",
              tags: ""
            })
          });
          return;
        }

        const environmentSlug = allSegments[0];
        const secretName = allSegments[allSegments.length - 1];
        let folderPath = "/";

        if (allSegments.length > 2) {
          const pathSegments = allSegments.slice(1, -1);
          for (let i = 0; i < pathSegments.length; i += 1) {
            if (!pathSegments[i]) {
              createNotification({ text: "Invalid secret reference", type: "error" });
              return;
            }
            const pathSegment = pathSegments[i];
            folderPath += `${pathSegment}`;
            if (pathSegment === segment) {
              folderPath += "/";
              break;
            }
            folderPath += "/";
          }
        }

        if (segment === secretName) {
          const canReadSecretValue = hasSecretReadValueOrDescribePermission(
            permission,
            ProjectPermissionSecretActions.ReadValue,
            {
              environment: environmentSlug,
              secretPath: folderPath,
              secretName,
              secretTags: ["*"]
            }
          );

          if (!canReadSecretValue) {
            createNotification({
              text: "You do not have permission to access this secret",
              type: "error"
            });
            return;
          }
        }

        navigate({
          to: ROUTE_PATHS.SecretManager.OverviewPage.path,
          params: { projectId },
          search: (prev) => ({
            ...prev,
            secretPath: segment === environmentSlug ? "/" : folderPath,
            search: segment === secretName ? secretName : prev.search,
            filterBy: segment === secretName ? "secret" : prev.filterBy,
            environments: [environmentSlug]
          })
        });
      },
      [navigate, projectId, permission, propEnvironment, propSecretPath]
    );

    return (
      <PopoverPrimitive.Root
        open={isPopupOpen}
        onOpenChange={(open) => {
          if (!open) setIsSuggestionActive(false);
        }}
      >
        <PopoverPrimitive.Anchor asChild>
          <SecretInput
            {...props}
            canEditButNotView={canEditButNotView}
            ref={handleRef}
            value={value}
            onBlur={(evt) => {
              if (!(evt.relatedTarget?.getAttribute("aria-label") === "suggestion-item"))
                setIsSuggestionActive(false);
              if (props.onBlur) props.onBlur(evt);
            }}
            onSelect={(evt) => {
              const { selectionStart, value: currentValue } = evt.currentTarget;
              setCursorPosition(selectionStart);
              if (getIndexOfUnclosedRefToTheLeft(currentValue, selectionStart - 1) === -1)
                setIsSuggestionActive(false);
              if (props.onSelect) props.onSelect(evt);
            }}
            onChange={(e) => {
              const { selectionStart, value: newValue } = e.target;
              onChange?.(newValue);
              setCursorPosition(selectionStart);
              setIsSuggestionActive(
                getIndexOfUnclosedRefToTheLeft(newValue, selectionStart - 1) !== -1
              );
            }}
            containerClassName={containerClassName}
            onClickSegment={handleClickSegment}
          />
        </PopoverPrimitive.Anchor>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            collisionPadding={8}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onWheel={(e) => e.stopPropagation()}
            className="relative top-2 z-[100] max-h-80 thin-scrollbar overflow-auto overscroll-contain rounded-md border border-border bg-popover text-foreground shadow-md"
            style={{ width: "var(--radix-popover-trigger-width)", minWidth: "320px" }}
          >
            <SecretReferenceWizard
              isEnabled={isPopupOpen}
              onSelect={handleWizardSelect}
              onNavigate={(content) => replaceReferenceContent(content, false)}
              onFocusItem={() => inputRef.current?.focus()}
              currentInput={referenceContent}
            />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    );
  }
);

InfisicalSecretInput.displayName = "InfisicalSecretInput";
