import { forwardRef, TextareaHTMLAttributes, useCallback, useMemo, useRef, useState } from "react";
import { faFolder, faKey, faLayerGroup, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as Popover from "@radix-ui/react-popover";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ROUTE_PATHS } from "@app/const/routes";
import { useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useDebounce, useToggle } from "@app/hooks";
import { useGetProjectFolders, useGetProjectSecrets } from "@app/hooks/api";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";

import { SecretInput } from "../SecretInput";

const getIndexOfUnclosedRefToTheLeft = (value: string, pos: number) => {
  // take substring up to pos in order to consider edits for closed references
  for (let i = pos; i >= 1; i -= 1) {
    if (value[i] === "}") return -1;
    if (value[i - 1] === "$" && value[i] === "{") {
      return i;
    }
  }
  return -1;
};

const getIndexOfUnclosedRefToTheRight = (value: string, pos: number) => {
  // use it with above to identify an open ${
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

      // means its like <environment>.<folder1>.<...more folder>.secret
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
        // the full value inside a ${<value>}
        value: suggestionSourceValue,
        // the final part after staging.dev.<folder1>.<predicate>
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
      // reset highlight whenever recomputation happens
      setHighlightedIndex(0);
      const suggestionsArr: ReferenceItem[] = [];
      const predicate = suggestionSource.predicate.toLowerCase();

      if (!suggestionSource.isDeep) {
        // At first level only environments and secrets
        (currentProject?.environments || []).forEach(({ name, slug }) => {
          if (name.toLowerCase().startsWith(predicate))
            suggestionsArr.push({
              label: name,
              slug,
              type: ReferenceType.ENVIRONMENT
            });
        });
      } else {
        // one deeper levels its based on an environment folders and secrets
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
      // <lhsValue>${}<rhsvalue>
      const lhsValue = value.slice(0, suggestionSource.left);
      const rhsValue = value.slice(
        rightBracketIndex !== -1 ? rightBracketIndex + 1 : currentCursorPosition
      );
      // mid will be computed value inside the interpolation
      const mid = suggestionSource.isDeep
        ? `${suggestionSource.value.slice(0, -suggestionSource.predicate.length || undefined)}${
            selectedSuggestion.slug
          }`
        : selectedSuggestion.slug;
      // whether we should append . or closing bracket on selecting suggestion
      const closingSymbol = getClosingSymbol(
        selectedSuggestion.type === ReferenceType.SECRET,
        isEnclosed
      );

      const newValue = `${lhsValue}${mid}${closingSymbol}${rhsValue}`;
      onChange?.(newValue);
      // this delay is for cursor adjustment
      // cannot do this without a delay because what happens in onChange gets propogated after the cursor change
      // Thus the cursor goes last to avoid that we put a slight delay on cursor change to make it happen later
      const delay = setTimeout(() => {
        clearTimeout(delay);
        if (inputRef.current)
          inputRef.current.selectionEnd =
            lhsValue.length +
            mid.length +
            closingSymbol.length +
            (isEnclosed && selectedSuggestion.type === ReferenceType.SECRET ? 1 : 0); // if secret is selected the cursor should move after the closing bracket -> }
      }, 10);
      setHighlightedIndex(-1); // reset highlight
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // key operation should trigger only when popup is open
      if (isPopupOpen) {
        if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
          setHighlightedIndex((prevIndex) => {
            let nextIndex = mod(prevIndex + 1, suggestions.length);
            // Skip "no match" messages
            while (
              nextIndex < suggestions.length &&
              suggestions[nextIndex].slug === "__no_match__"
            ) {
              nextIndex = mod(nextIndex + 1, suggestions.length);
            }
            // If we only have no-match messages, don't highlight anything
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
            // Skip "no match" messages
            while (prevIdx >= 0 && suggestions[prevIdx].slug === "__no_match__") {
              prevIdx = mod(prevIdx - 1, suggestions.length);
            }
            // If we only have no-match messages, don't highlight anything
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

    // to handle multiple ref for single component
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

        // Only validate secret permission, users can always view environments and folders
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

    return (
      <Popover.Root open={isPopupOpen} onOpenChange={handlePopUpOpen}>
        <Popover.Trigger asChild>
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
              // should not on blur when its mouse down selecting a item from suggestion
              if (!(evt.relatedTarget?.getAttribute("aria-label") === "suggestion-item"))
                setIsFocused.off();

              if (props.onBlur) props.onBlur(evt);
            }}
            onChange={(e) => onChange?.(e.target.value)}
            containerClassName={containerClassName}
            onClickSegment={handleClickSegment}
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="relative top-2 z-100 max-h-64 thin-scrollbar overflow-auto rounded-md border border-mineshaft-600 bg-mineshaft-900 font-inter text-bunker-100 shadow-md"
            style={{
              width: "var(--radix-popover-trigger-width)"
            }}
          >
            <div
              className="h-full w-full flex-col items-center justify-center rounded-md text-white"
              ref={popoverContentRef}
            >
              {suggestions.map((item, i) => {
                let entryIcon;
                let subText;
                const isNoMatchMessage = item.slug === "__no_match__";

                if (isNoMatchMessage) {
                  entryIcon = <FontAwesomeIcon icon={faSearch} className="text-gray-400" />;
                  subText = "No results";
                } else if (item.type === ReferenceType.SECRET) {
                  entryIcon = <FontAwesomeIcon icon={faKey} className="text-bunker-300" />;
                  subText = "Secret";
                } else if (item.type === ReferenceType.ENVIRONMENT) {
                  entryIcon = <FontAwesomeIcon icon={faLayerGroup} className="text-green-700" />;
                  subText = "Environment";
                } else {
                  entryIcon = <FontAwesomeIcon icon={faFolder} className="text-yellow-700" />;
                  subText = "Folder";
                }

                return isNoMatchMessage ? (
                  <div
                    role="status"
                    aria-label="no-match-message"
                    className="flex w-full items-center justify-between border-mineshaft-600 text-left"
                    key={`secret-reference-secret-${i + 1}`}
                  >
                    <div className="text-md relative flex w-full cursor-default items-center justify-between px-2 py-2 opacity-75 outline-hidden transition-all select-none">
                      <div className="flex w-full items-start gap-2">
                        <div className="mt-1 flex items-center">{entryIcon}</div>
                        <div className="text-md w-10/12 truncate text-left">
                          <span className="text-gray-400">{item.label}</span>
                          <div className="mb-[0.1rem] text-xs leading-3 text-bunker-400">
                            {subText}
                          </div>
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
                    className="flex w-full items-center justify-between border-none border-mineshaft-600 bg-transparent p-0 text-left"
                    key={`secret-reference-secret-${i + 1}`}
                  >
                    <div
                      className={`${
                        highlightedIndex === i ? "bg-mineshaft-500" : ""
                      } text-md relative flex w-full cursor-pointer items-center justify-between px-2 py-2 outline-hidden transition-all select-none hover:bg-mineshaft-700 data-highlighted:bg-mineshaft-700`}
                    >
                      <div className="flex w-full items-start gap-2">
                        <div className="mt-1 flex items-center">{entryIcon}</div>
                        <div className="text-md w-10/12 truncate text-left">
                          <span>{item.label}</span>
                          <div className="mb-[0.1rem] text-xs leading-3 text-bunker-400">
                            {subText}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }
);

InfisicalSecretInput.displayName = "InfisicalSecretInput";
