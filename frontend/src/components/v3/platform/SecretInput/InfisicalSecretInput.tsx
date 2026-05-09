import { forwardRef, TextareaHTMLAttributes, useCallback, useMemo, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useNavigate } from "@tanstack/react-router";
import { FolderIcon, KeyRoundIcon, LayersIcon, SearchIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ROUTE_PATHS } from "@app/const/routes";
import { useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useDebounce, useToggle } from "@app/hooks";
import { useGetProjectFolders, useGetProjectSecrets } from "@app/hooks/api";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";

import { cn } from "../../utils";
import { SecretInput } from "./SecretInput";

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

const getClosingSymbol = (isSelectedSecret: boolean, isClosed: boolean) => {
  if (!isClosed) {
    return isSelectedSecret ? "}" : ".";
  }
  if (!isSelectedSecret) return ".";
  return "";
};

const mod = (n: number, m: number) => ((n % m) + m) % m;

export enum ReferenceType {
  ENVIRONMENT = "environment",
  FOLDER = "folder",
  SECRET = "secret"
}

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

type ReferenceItem = {
  label: string;
  type: ReferenceType;
  slug: string;
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

    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const popoverContentRef = useRef<HTMLDivElement>(null);
    const [isFocused, setIsFocused] = useToggle(false);
    const currentCursorPosition = inputRef.current?.selectionStart || 0;

    const suggestionSource = useMemo(() => {
      const left = getIndexOfUnclosedRefToTheLeft(debouncedValue, currentCursorPosition - 1);
      if (left === -1) return { left, value: "", predicate: "", isDeep: false };

      const suggestionSourceValue = debouncedValue.slice(left + 1, currentCursorPosition);
      let suggestionSourceEnv: string | undefined = propEnvironment;
      let suggestionSourceSecretPath: string | undefined = propSecretPath || "/";

      const isDeep = suggestionSourceValue.includes(".");
      let predicate = suggestionSourceValue;
      if (isDeep) {
        const [envSlug, ...folderPaths] = suggestionSourceValue.split(".");
        const isValidEnvSlug = currentProject?.environments.find((e) => e.slug === envSlug);
        suggestionSourceEnv = isValidEnvSlug ? envSlug : undefined;
        suggestionSourceSecretPath = `/${folderPaths.slice(0, -1)?.join("/")}`;
        predicate = folderPaths[folderPaths.length - 1];
      }

      return {
        left: left + 1,
        value: suggestionSourceValue,
        predicate,
        isOpen: left !== -1,
        isDeep,
        environment: suggestionSourceEnv,
        secretPath: suggestionSourceSecretPath
      };
    }, [debouncedValue]);

    const isPopupOpen = Boolean(suggestionSource.isOpen) && isFocused;
    const { data: secrets } = useGetProjectSecrets({
      viewSecretValue: false,
      environment: suggestionSource.environment || "",
      secretPath: suggestionSource.secretPath || "",
      projectId,
      options: {
        enabled: isPopupOpen
      }
    });
    const { data: folders } = useGetProjectFolders({
      environment: suggestionSource.environment || "",
      path: suggestionSource.secretPath || "",
      projectId,
      options: {
        enabled: isPopupOpen
      }
    });

    const suggestions = useMemo(() => {
      if (!isPopupOpen) return [];
      setHighlightedIndex(0);
      const suggestionsArr: ReferenceItem[] = [];
      const predicate = suggestionSource.predicate.toLowerCase();

      if (!suggestionSource.isDeep) {
        (currentProject?.environments || []).forEach(({ name, slug }) => {
          if (name.toLowerCase().startsWith(predicate))
            suggestionsArr.push({
              label: name,
              slug,
              type: ReferenceType.ENVIRONMENT
            });
        });
      } else {
        (folders || []).forEach(({ name }) => {
          if (name.toLowerCase().startsWith(predicate))
            suggestionsArr.push({
              label: name,
              slug: name,
              type: ReferenceType.FOLDER
            });
        });
      }
      (secrets || []).forEach(({ key }) => {
        if (key.toLowerCase().startsWith(predicate))
          suggestionsArr.push({
            label: key,
            slug: key,
            type: ReferenceType.SECRET
          });
      });

      if (suggestionsArr.length === 0 && suggestionSource.predicate.trim()) {
        suggestionsArr.push({
          label: "No matches found",
          slug: "__no_match__",
          type: ReferenceType.SECRET
        });
      }

      return suggestionsArr;
    }, [
      secrets,
      folders,
      currentProject?.environments,
      isPopupOpen,
      suggestionSource.value,
      suggestionSource.predicate
    ]);

    const handleSuggestionSelect = (selectIndex?: number) => {
      const selectedSuggestion =
        suggestions[typeof selectIndex !== "undefined" ? selectIndex : highlightedIndex];
      if (!selectedSuggestion || selectedSuggestion.slug === "__no_match__") {
        return;
      }

      const rightBracketIndex = getIndexOfUnclosedRefToTheRight(value, suggestionSource.left);
      const isEnclosed = rightBracketIndex !== -1;
      const lhsValue = value.slice(0, suggestionSource.left);
      const rhsValue = value.slice(
        rightBracketIndex !== -1 ? rightBracketIndex + 1 : currentCursorPosition
      );
      const mid = suggestionSource.isDeep
        ? `${suggestionSource.value.slice(0, -suggestionSource.predicate.length || undefined)}${
            selectedSuggestion.slug
          }`
        : selectedSuggestion.slug;
      const closingSymbol = getClosingSymbol(
        selectedSuggestion.type === ReferenceType.SECRET,
        isEnclosed
      );

      const newValue = `${lhsValue}${mid}${closingSymbol}${rhsValue}`;
      onChange?.(newValue);
      const delay = setTimeout(() => {
        clearTimeout(delay);
        if (inputRef.current)
          inputRef.current.selectionEnd =
            lhsValue.length +
            mid.length +
            closingSymbol.length +
            (isEnclosed && selectedSuggestion.type === ReferenceType.SECRET ? 1 : 0);
      }, 10);
      setHighlightedIndex(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isPopupOpen) {
        if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
          setHighlightedIndex((prevIndex) => {
            let nextIndex = mod(prevIndex + 1, suggestions.length);
            while (
              nextIndex < suggestions.length &&
              suggestions[nextIndex].slug === "__no_match__"
            ) {
              nextIndex = mod(nextIndex + 1, suggestions.length);
            }
            if (suggestions[nextIndex]?.slug === "__no_match__") {
              return -1;
            }
            popoverContentRef.current?.children?.[nextIndex]?.scrollIntoView({
              block: "nearest",
              behavior: "smooth"
            });
            return nextIndex;
          });
        } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
          setHighlightedIndex((prevIndex) => {
            let prevIdx = mod(prevIndex - 1, suggestions.length);
            while (prevIdx >= 0 && suggestions[prevIdx].slug === "__no_match__") {
              prevIdx = mod(prevIdx - 1, suggestions.length);
            }
            if (suggestions[prevIdx]?.slug === "__no_match__") {
              return -1;
            }
            popoverContentRef.current?.children?.[prevIdx]?.scrollIntoView({
              block: "nearest",
              behavior: "smooth"
            });
            return prevIdx;
          });
        } else if (e.key === "Enter" && highlightedIndex >= 0) {
          e.preventDefault();
          handleSuggestionSelect();
        }
        if (["ArrowDown", "ArrowUp", "Tab"].includes(e.key)) {
          e.preventDefault();
        }
      }
    };

    const handlePopUpOpen = () => {
      setHighlightedIndex(-1);
    };

    const handleRef = useCallback((el: HTMLTextAreaElement) => {
      // @ts-expect-error this is for multiple ref single component
      inputRef.current = el;
      if (ref) {
        if (typeof ref === "function") {
          ref(el);
        } else {
          // eslint-disable-next-line
          ref.current = el;
        }
      }
    }, []);

    const handleClickSegment = useCallback(
      (segment: string, allSegments: string[]) => {
        if (!projectId) {
          createNotification({
            text: "Project ID is not set",
            type: "error"
          });
          return;
        }

        if (allSegments.length === 0) {
          createNotification({
            text: "Invalid secret reference",
            type: "error"
          });
          return;
        }

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
              createNotification({
                text: "Invalid secret reference",
                type: "error"
              });
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
          params: {
            projectId,
            envSlug: environmentSlug
          },
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

    const getEntryIcon = (item: ReferenceItem) => {
      if (item.slug === "__no_match__") {
        return <SearchIcon className="size-4 text-muted" />;
      }
      if (item.type === ReferenceType.SECRET) {
        return <KeyRoundIcon className="size-4 text-muted" />;
      }
      if (item.type === ReferenceType.ENVIRONMENT) {
        return <LayersIcon className="size-4 text-success" />;
      }
      return <FolderIcon className="size-4 text-warning" />;
    };

    const getSubText = (item: ReferenceItem) => {
      if (item.slug === "__no_match__") return "No results";
      if (item.type === ReferenceType.SECRET) return "Secret";
      if (item.type === ReferenceType.ENVIRONMENT) return "Environment";
      return "Folder";
    };

    return (
      <PopoverPrimitive.Root open={isPopupOpen} onOpenChange={handlePopUpOpen}>
        <PopoverPrimitive.Trigger asChild>
          <SecretInput
            {...props}
            canEditButNotView={canEditButNotView}
            ref={handleRef}
            onKeyDown={handleKeyDown}
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
            className="relative top-2 z-[100] max-h-64 thin-scrollbar overflow-auto rounded-md border border-border bg-popover text-foreground shadow-md"
            style={{
              width: "var(--radix-popover-trigger-width)"
            }}
          >
            <div
              className="flex h-full w-full flex-col items-center justify-center rounded-md"
              ref={popoverContentRef}
            >
              {suggestions.map((item, i) => {
                const isNoMatchMessage = item.slug === "__no_match__";
                const entryIcon = getEntryIcon(item);
                const subText = getSubText(item);

                return isNoMatchMessage ? (
                  <div
                    role="status"
                    aria-label="no-match-message"
                    className="flex w-full items-center justify-between text-left"
                    key={`secret-reference-secret-${i + 1}`}
                  >
                    <div className="relative flex w-full cursor-default items-center justify-between px-2 py-2 text-sm opacity-75 outline-hidden transition-all select-none">
                      <div className="flex w-full items-start gap-2">
                        <div className="mt-0.5 flex items-center">{entryIcon}</div>
                        <div className="w-10/12 truncate text-left">
                          <span className="text-muted">{item.label}</span>
                          <div className="mb-[0.1rem] text-xs leading-3 text-muted">{subText}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSuggestionSelect(i);
                    }}
                    aria-label="suggestion-item"
                    onClick={(e) => {
                      inputRef.current?.focus();
                      e.preventDefault();
                      e.stopPropagation();
                      handleSuggestionSelect(i);
                    }}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    className="flex w-full items-center justify-between border-none bg-transparent p-0 text-left"
                    key={`secret-reference-secret-${i + 1}`}
                  >
                    <div
                      className={cn(
                        "relative flex w-full cursor-pointer items-center justify-between px-2 py-2 text-sm outline-hidden transition-all select-none hover:bg-foreground/10",
                        highlightedIndex === i && "bg-foreground/5"
                      )}
                    >
                      <div className="flex w-full items-start gap-2">
                        <div className="mt-0.5 flex items-center">{entryIcon}</div>
                        <div className="w-10/12 truncate text-left">
                          <span>{item.label}</span>
                          <div className="mb-[0.1rem] text-xs leading-3 text-muted">{subText}</div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    );
  }
);

InfisicalSecretInput.displayName = "InfisicalSecretInput";
