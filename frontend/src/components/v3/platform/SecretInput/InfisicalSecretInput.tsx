import { forwardRef, TextareaHTMLAttributes, useCallback, useRef } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ROUTE_PATHS } from "@app/const/routes";
import { useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useDebounce, useToggle } from "@app/hooks";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";

import { SecretInput } from "./SecretInput";
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
  value?: string;
  onChange: (val: string) => void;
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
      value = "",
      onChange,
      containerClassName,
      secretPath: propSecretPath,
      environment: propEnvironment,
      canEditButNotView,
      ...props
    },
    ref
  ) => {
    const { currentProject } = useProject();
    const projectId = currentProject?.id || "";
    const navigate = useNavigate({ from: ROUTE_PATHS.SecretManager.SecretDashboardPage.path });
    const { permission } = useProjectPermission();

    const [debouncedValue] = useDebounce(value, 100);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [isFocused, setIsFocused] = useToggle(false);
    const currentCursorPosition = inputRef.current?.selectionStart || 0;

    const openRefLeft = (() => {
      const left = getIndexOfUnclosedRefToTheLeft(debouncedValue, currentCursorPosition - 1);
      if (left === -1) return -1;
      return left;
    })();

    const isPopupOpen = openRefLeft !== -1 && isFocused;

    const handleWizardSelect = (referenceContent: string) => {
      const left = openRefLeft + 1; // position right after ${
      const rightBracketIndex = getIndexOfUnclosedRefToTheRight(value, left);
      const isEnclosed = rightBracketIndex !== -1;

      const lhsValue = value.slice(0, left);
      const rhsValue = value.slice(
        rightBracketIndex !== -1 ? rightBracketIndex + 1 : currentCursorPosition
      );

      const newValue = `${lhsValue}${referenceContent}${isEnclosed ? "" : "}"}${rhsValue}`;
      onChange?.(newValue);

      const delay = setTimeout(() => {
        clearTimeout(delay);
        if (inputRef.current) {
          const cursorPos = lhsValue.length + referenceContent.length + 1; // +1 for }
          inputRef.current.selectionEnd = cursorPos;
        }
      }, 10);

      setIsFocused.off();
    };

    const handleRef = useCallback(
      (el: HTMLTextAreaElement) => {
        // @ts-expect-error multiple refs
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
          to: ROUTE_PATHS.SecretManager.SecretDashboardPage.path,
          params: { projectId, envSlug: environmentSlug },
          search: (prev) => ({
            ...prev,
            secretPath: segment === environmentSlug ? "/" : folderPath,
            search: segment === secretName ? secretName : prev.search,
            filterBy: segment === secretName ? "secret" : prev.filterBy,
            tags: ""
          })
        });
      },
      [navigate, projectId, permission, propEnvironment, propSecretPath]
    );

    return (
      <PopoverPrimitive.Root open={isPopupOpen}>
        <PopoverPrimitive.Trigger asChild>
          <SecretInput
            {...props}
            canEditButNotView={canEditButNotView}
            ref={handleRef}
            value={value}
            onFocus={(evt) => {
              if (props.onFocus) props.onFocus(evt);
              setIsFocused.on();
            }}
            onBlur={(evt) => {
              if (!(evt.relatedTarget?.getAttribute("aria-label") === "suggestion-item"))
                setIsFocused.off();
              if (props.onBlur) props.onBlur(evt);
            }}
            onChange={(e) => onChange?.(e.target.value)}
            containerClassName={containerClassName}
            onClickSegment={handleClickSegment}
          />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            className="relative top-2 z-[100] max-h-80 thin-scrollbar overflow-auto rounded-md border border-border bg-popover text-foreground shadow-md"
            style={{ width: "var(--radix-popover-trigger-width)", minWidth: "320px" }}
          >
            <SecretReferenceWizard
              isEnabled={isPopupOpen}
              onSelect={handleWizardSelect}
              onFocusItem={() => inputRef.current?.focus()}
              currentInput={
                openRefLeft !== -1
                  ? debouncedValue.slice(openRefLeft + 1, currentCursorPosition)
                  : ""
              }
            />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    );
  }
);

InfisicalSecretInput.displayName = "InfisicalSecretInput";
