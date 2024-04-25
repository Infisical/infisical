import { TextareaHTMLAttributes, useEffect, useRef, useState } from "react";
import { faCircle, faFolder, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as Popover from "@radix-ui/react-popover";
import { twMerge } from "tailwind-merge";

import { useWorkspace } from "@app/context";
import { useDebounce } from "@app/hooks";
import { useGetFoldersByEnv, useGetProjectSecrets, useGetUserWsKey } from "@app/hooks/api";

import { SecretInput } from "../SecretInput";

const REGEX_UNCLOSED_SECRET_REFERENCE = /\${(?![^{}]*\})/g;
const REGEX_OPEN_SECRET_REFERENCE = /\${/g;

export enum ReferenceType {
  ENVIRONMENT = "environment",
  FOLDER = "folder",
  SECRET = "secret"
}

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value?: string | null;
  isImport?: boolean;
  isVisible?: boolean;
  isReadOnly?: boolean;
  isDisabled?: boolean;
  secretPath?: string;
  environment?: string;
  containerClassName?: string;
};

type ReferenceItem = {
  name: string;
  type: ReferenceType;
  slug?: string;
};

export const InfisicalSecretInput = ({
  value: propValue,
  isVisible,
  containerClassName,
  onBlur,
  isDisabled,
  isImport,
  isReadOnly,
  secretPath: propSecretPath,
  environment: propEnvironment,
  onChange,
  ...props
}: Props) => {
  const [inputValue, setInputValue] = useState(propValue ?? "");
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [currentCursorPosition, setCurrentCursorPosition] = useState(0);
  const [currentReference, setCurrentReference] = useState<string>("");
  const [secretPath, setSecretPath] = useState<string>(propSecretPath || "/");
  const [environment, setEnvironment] = useState<string | undefined>(propEnvironment);
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";
  const { data: decryptFileKey } = useGetUserWsKey(workspaceId);
  const { data: secrets } = useGetProjectSecrets({
    decryptFileKey: decryptFileKey!,
    environment: environment || currentWorkspace?.environments?.[0].slug!,
    secretPath,
    workspaceId
  });
  const { folderNames: folders } = useGetFoldersByEnv({
    path: secretPath,
    environments: [environment || currentWorkspace?.environments?.[0].slug!],
    projectId: workspaceId
  });

  const debouncedCurrentReference = useDebounce(currentReference, 100);

  const [listReference, setListReference] = useState<ReferenceItem[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setInputValue(propValue ?? "");
  }, [propValue]);

  useEffect(() => {
    let currentEnvironment = propEnvironment;
    let currentSecretPath = propSecretPath || "/";

    if (!currentReference) {
      setSecretPath(currentSecretPath);
      setEnvironment(currentEnvironment);
      return;
    }

    const isNested = currentReference.includes(".");

    if (isNested) {
      const [envSlug, ...folderPaths] = currentReference.split(".");
      const isValidEnvSlug = currentWorkspace?.environments.find((e) => e.slug === envSlug);
      currentEnvironment = isValidEnvSlug ? envSlug : undefined;

      // should be based on the last valid section (with .)
      folderPaths.pop();
      currentSecretPath = `/${folderPaths?.join("/")}`;
    }

    setSecretPath(currentSecretPath);
    setEnvironment(currentEnvironment);
  }, [debouncedCurrentReference]);

  useEffect(() => {
    const currentListReference: ReferenceItem[] = [];
    const isNested = currentReference?.includes(".");

    if (!currentReference) {
      setListReference(currentListReference);
      return;
    }

    if (!environment) {
      currentWorkspace?.environments.forEach((env) => {
        currentListReference.unshift({
          name: env.slug,
          type: ReferenceType.ENVIRONMENT
        });
      });
    } else if (isNested) {
      folders?.forEach((folder) => {
        currentListReference.unshift({ name: folder, type: ReferenceType.FOLDER });
      });
    } else if (environment) {
      currentWorkspace?.environments.forEach((env) => {
        currentListReference.unshift({
          name: env.slug,
          type: ReferenceType.ENVIRONMENT
        });
      });
    }

    secrets?.forEach((secret) => {
      currentListReference.unshift({ name: secret.key, type: ReferenceType.SECRET });
    });

    // Get fragment inside currentReference
    const searchFragment = isNested ? currentReference.split(".").pop() || "" : currentReference;
    const filteredListRef = currentListReference
      .filter((suggestionEntry) =>
        suggestionEntry.name.toUpperCase().startsWith(searchFragment.toUpperCase())
      )
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    setListReference(filteredListRef);
  }, [secrets, environment, debouncedCurrentReference]);

  const getIndexOfUnclosedRefToTheLeft = (pos: number) => {
    // take substring up to pos in order to consider edits for closed references
    const unclosedReferenceIndexMatches = [
      ...inputValue.substring(0, pos).matchAll(REGEX_UNCLOSED_SECRET_REFERENCE)
    ].map((match) => match.index);

    // find unclosed reference index less than the current cursor position
    let indexIter = -1;
    unclosedReferenceIndexMatches.forEach((index) => {
      if (index !== undefined && index > indexIter && index < pos) {
        indexIter = index;
      }
    });

    return indexIter;
  };

  const getIndexOfUnclosedRefToTheRight = (pos: number) => {
    const unclosedReferenceIndexMatches = [...inputValue.matchAll(REGEX_OPEN_SECRET_REFERENCE)].map(
      (match) => match.index
    );

    // find the next unclosed reference index to the right of the current cursor position
    // this is so that we know the limitation for slicing references
    let indexIter = Infinity;
    unclosedReferenceIndexMatches.forEach((index) => {
      if (index !== undefined && index > pos && index < indexIter) {
        indexIter = index;
      }
    });

    return indexIter;
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // open suggestions if current position is to the right of an unclosed secret reference
    const indexIter = getIndexOfUnclosedRefToTheLeft(currentCursorPosition);
    if (indexIter === -1) {
      return;
    }

    setIsSuggestionsOpen(true);

    if (e.key !== "Enter") {
      // current reference is then going to be based on the text from the closest ${ to the right
      // until the current cursor position
      const openReferenceValue = inputValue.slice(indexIter + 2, currentCursorPosition);
      setCurrentReference(openReferenceValue);
    }
  };

  const handleSuggestionSelect = (selectedIndex?: number) => {
    const selectedSuggestion = listReference[selectedIndex ?? highlightedIndex];

    if (!selectedSuggestion) {
      return;
    }

    const leftIndexIter = getIndexOfUnclosedRefToTheLeft(currentCursorPosition);
    const rightIndexLimit = getIndexOfUnclosedRefToTheRight(currentCursorPosition);

    if (leftIndexIter === -1) {
      return;
    }

    let newValue = "";
    const currentOpenRef = inputValue.slice(leftIndexIter + 2, currentCursorPosition);
    if (currentOpenRef.includes(".")) {
      // append suggestion after last DOT (.)
      const lastDotIndex = currentReference.lastIndexOf(".");
      const existingPath = currentReference.slice(0, lastDotIndex);
      const refEndAfterAppending = Math.min(
        leftIndexIter +
          3 +
          existingPath.length +
          selectedSuggestion.name.length +
          Number(selectedSuggestion.type !== ReferenceType.SECRET),
        rightIndexLimit - 1
      );

      newValue = `${inputValue.slice(0, leftIndexIter + 2)}${existingPath}.${
        selectedSuggestion.name
      }${selectedSuggestion.type !== ReferenceType.SECRET ? "." : "}"}${inputValue.slice(
        refEndAfterAppending
      )}`;
      const openReferenceValue = newValue.slice(leftIndexIter + 2, refEndAfterAppending);
      setCurrentReference(openReferenceValue);

      // add 1 in order to prevent referenceOpen from being triggered by handleKeyUp
      setCurrentCursorPosition(refEndAfterAppending + 1);
    } else {
      // append selectedSuggestion at position after unclosed ${
      const refEndAfterAppending = Math.min(
        selectedSuggestion.name.length +
          leftIndexIter +
          2 +
          Number(selectedSuggestion.type !== ReferenceType.SECRET),
        rightIndexLimit - 1
      );

      newValue = `${inputValue.slice(0, leftIndexIter + 2)}${selectedSuggestion.name}${
        selectedSuggestion.type !== ReferenceType.SECRET ? "." : "}"
      }${inputValue.slice(refEndAfterAppending)}`;

      const openReferenceValue = newValue.slice(leftIndexIter + 2, refEndAfterAppending);
      setCurrentReference(openReferenceValue);
      setCurrentCursorPosition(refEndAfterAppending);
    }

    onChange?.({ target: { value: newValue } } as any);
    setInputValue(newValue);
    setHighlightedIndex(-1);
    setIsSuggestionsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = (n: number, m: number) => ((n % m) + m) % m;
    if (e.key === "ArrowDown") {
      setHighlightedIndex((prevIndex) => mod(prevIndex + 1, listReference.length));
    } else if (e.key === "ArrowUp") {
      setHighlightedIndex((prevIndex) => mod(prevIndex - 1, listReference.length));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      handleSuggestionSelect();
    }
    if (["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
      e.preventDefault();
    }
  };

  const setIsOpen = (isOpen: boolean) => {
    setHighlightedIndex(-1);

    if (isSuggestionsOpen) {
      setIsSuggestionsOpen(isOpen);
    }
  };

  const handleSecretChange = (e: any) => {
    // propagate event to react-hook-form onChange
    if (onChange) {
      onChange(e);
    }

    setCurrentCursorPosition(inputRef.current?.selectionStart || 0);
    setInputValue(e.target.value);
  };

  return (
    <Popover.Root
      open={isSuggestionsOpen && listReference.length > 0 && currentReference.length > 0}
      onOpenChange={setIsOpen}
    >
      <Popover.Trigger asChild>
        <SecretInput
          {...props}
          ref={inputRef}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          value={inputValue}
          onChange={handleSecretChange}
          containerClassName={containerClassName}
        />
      </Popover.Trigger>
      <Popover.Content
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={twMerge(
          "relative top-3 z-[100] ml-4 overflow-hidden rounded-md border border-mineshaft-600 bg-mineshaft-900 font-inter text-bunker-100 shadow-md"
        )}
        style={{
          width: "300px",
          maxHeight: "var(--radix-select-content-available-height)"
        }}
      >
        <div className="max-w-60 h-full w-full flex-col items-center justify-center rounded-md text-white">
          {listReference.map((item, i) => {
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
                onMouseDown={(e) => {
                  e.preventDefault();
                  setHighlightedIndex(i);
                  handleSuggestionSelect(i);
                }}
                style={{ pointerEvents: "auto" }}
                className="flex items-center justify-between border-mineshaft-600 text-left"
                key={`secret-reference-secret-${i + 1}`}
              >
                <div
                  className={`${
                    highlightedIndex === i ? "bg-gray-600" : ""
                  } text-md relative mb-0.5 flex w-full cursor-pointer select-none items-center justify-between rounded-md px-2 py-1 outline-none transition-all hover:bg-mineshaft-500 data-[highlighted]:bg-mineshaft-500`}
                >
                  <div className="flex gap-2">
                    <div className="flex items-center text-yellow-700">
                      <FontAwesomeIcon
                        icon={entryIcon}
                        size={item.type === ReferenceType.ENVIRONMENT ? "xs" : "1x"}
                      />
                    </div>
                    <div className="text-md w-48 truncate text-left">{item.name}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
};

InfisicalSecretInput.displayName = "InfisicalSecretInput";
