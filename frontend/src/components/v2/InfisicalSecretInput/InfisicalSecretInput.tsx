import { forwardRef, TextareaHTMLAttributes, useCallback, useMemo, useRef, useState } from "react";
import { faCircle, faFolder, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as Popover from "@radix-ui/react-popover";

import { useWorkspace } from "@app/context";
import { useDebounce, useToggle } from "@app/hooks";
import { useGetProjectFolders, useGetProjectSecrets } from "@app/hooks/api";

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
  secretPath?: string;
  environment?: string;
  containerClassName?: string;
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
      ...props
    },
    ref
  ) => {
    const { currentWorkspace } = useWorkspace();
    const workspaceId = currentWorkspace?.id || "";

    const [debouncedValue] = useDebounce(value, 500);

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
        const isValidEnvSlug = currentWorkspace?.environments.find((e) => e.slug === envSlug);
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
      environment: suggestionSource.environment || "",
      secretPath: suggestionSource.secretPath || "",
      workspaceId,
      options: {
        enabled: isPopupOpen
      }
    });
    const { data: folders } = useGetProjectFolders({
      environment: suggestionSource.environment || "",
      path: suggestionSource.secretPath || "",
      projectId: workspaceId,
      options: {
        enabled: isPopupOpen
      }
    });

    const suggestions = useMemo(() => {
      if (!isPopupOpen) return [];
      // reset highlight whenever recomputation happens
      setHighlightedIndex(-1);
      const suggestionsArr: ReferenceItem[] = [];
      const predicate = suggestionSource.predicate.toLowerCase();

      if (!suggestionSource.isDeep) {
        // At first level only environments and secrets
        (currentWorkspace?.environments || []).forEach(({ name, slug }) => {
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
      return suggestionsArr;
    }, [secrets, folders, currentWorkspace?.environments, isPopupOpen, suggestionSource.value]);

    const handleSuggestionSelect = (selectIndex?: number) => {
      const selectedSuggestion =
        suggestions[typeof selectIndex !== "undefined" ? selectIndex : highlightedIndex];
      if (!selectedSuggestion) {
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
            const pos = mod(prevIndex + 1, suggestions.length);
            popoverContentRef.current?.children?.[pos]?.scrollIntoView({
              block: "nearest",
              behavior: "smooth"
            });
            return pos;
          });
        } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
          setHighlightedIndex((prevIndex) => {
            const pos = mod(prevIndex - 1, suggestions.length);
            popoverContentRef.current?.children?.[pos]?.scrollIntoView({
              block: "nearest",
              behavior: "smooth"
            });
            return pos;
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

    return (
      <Popover.Root open={isPopupOpen} onOpenChange={handlePopUpOpen}>
        <Popover.Trigger asChild>
          <SecretInput
            {...props}
            ref={handleRef}
            onKeyDown={handleKeyDown}
            value={value}
            onFocus={() => setIsFocused.on()}
            onBlur={(evt) => {
              // should not on blur when its mouse down selecting a item from suggestion
              if (!(evt.relatedTarget?.getAttribute("aria-label") === "suggestion-item"))
                setIsFocused.off();
            }}
            onChange={(e) => onChange?.(e.target.value)}
            containerClassName={containerClassName}
          />
        </Popover.Trigger>
        <Popover.Content
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="relative top-2 z-[100] max-h-64 overflow-auto rounded-md border border-mineshaft-600 bg-mineshaft-900 font-inter text-bunker-100 shadow-md"
          style={{
            width: "var(--radix-popover-trigger-width)"
          }}
        >
          <div
            className="max-w-60 h-full w-full flex-col items-center justify-center rounded-md text-white"
            ref={popoverContentRef}
          >
            {suggestions.map((item, i) => {
              let entryIcon;
              if (item.type === ReferenceType.SECRET) {
                entryIcon = faKey;
              } else if (item.type === ReferenceType.ENVIRONMENT) {
                entryIcon = faCircle;
              } else {
                entryIcon = faFolder;
              }

              return (
                <div
                  tabIndex={0}
                  role="button"
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
                  style={{ pointerEvents: "auto" }}
                  className="flex items-center justify-between border-mineshaft-600 text-left"
                  key={`secret-reference-secret-${i + 1}`}
                >
                  <div
                    className={`${
                      highlightedIndex === i ? "bg-gray-600" : ""
                    } text-md relative mb-0.5 flex w-full cursor-pointer select-none items-center justify-between rounded-md px-2 py-2 outline-none transition-all hover:bg-mineshaft-500 data-[highlighted]:bg-mineshaft-500`}
                  >
                    <div className="flex w-full gap-2">
                      <div className="flex items-center text-yellow-700">
                        <FontAwesomeIcon
                          icon={entryIcon}
                          size={item.type === ReferenceType.ENVIRONMENT ? "xs" : "1x"}
                        />
                      </div>
                      <div className="text-md w-10/12 truncate text-left">{item.label}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Root>
    );
  }
);

InfisicalSecretInput.displayName = "InfisicalSecretInput";
