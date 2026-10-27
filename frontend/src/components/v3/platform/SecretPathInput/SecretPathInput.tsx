import { InputHTMLAttributes, useEffect, useRef, useState } from "react";
import { Folder } from "lucide-react";

import { useProject } from "@app/context";
import { useDebounce } from "@app/hooks";
import { useGetFoldersByEnv } from "@app/hooks/api";

import { Input } from "../../generic/Input";
import { Popover, PopoverAnchor, PopoverContent } from "../../generic/Popover";
import { cn } from "../../utils";

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "onChange"> & {
  value?: string | null;
  environment?: string;
  containerClassName?: string;
  isError?: boolean;
  onChange?: (arg: string) => void;
  folderNames?: string[];
  projectId: string;
};

type Props = Omit<BaseProps, "projectId"> & { projectId?: string };

const SecretPathInputBase = ({
  containerClassName,
  onChange,
  environment,
  projectId,
  value: propValue,
  folderNames: folderNamesProp,
  isError,
  onKeyDown,
  onFocus,
  onBlur,
  ...props
}: BaseProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(propValue ?? "");
  const [secretPath, setSecretPath] = useState("/");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isInputFocused, setIsInputFocus] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [debouncedInputValue] = useDebounce(inputValue, 200);
  const { folderNames: folders } = useGetFoldersByEnv({
    path: secretPath,
    environments: folderNamesProp === undefined ? [environment ?? ""] : [],
    projectId
  });

  useEffect(() => {
    setInputValue(propValue ?? "/");
  }, [propValue]);

  useEffect(() => {
    if (
      (debouncedInputValue.length > 0 &&
        debouncedInputValue[debouncedInputValue.length - 1] === "/") ||
      debouncedInputValue.length === 0
    ) {
      setSecretPath(debouncedInputValue);
    }
  }, [debouncedInputValue]);

  useEffect(() => {
    const activeFolders = folderNamesProp ?? folders;
    const searchFragment = debouncedInputValue.split("/").pop() || "";
    const filteredSuggestions = activeFolders
      .filter((entry) => entry.toUpperCase().startsWith(searchFragment.toUpperCase()))
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    setSuggestions(filteredSuggestions);
    setHighlightedIndex(-1);
  }, [debouncedInputValue, folders, folderNamesProp]);

  const handleSuggestionSelect = (selectedIndex: number) => {
    if (!suggestions[selectedIndex]) return;

    const validPaths = inputValue.split("/");
    validPaths.pop();

    const newValue = `${validPaths.join("/")}/${suggestions[selectedIndex]}/`;
    onChange?.(newValue);
    setInputValue(newValue);
    setSecretPath(newValue);
    setHighlightedIndex(-1);
    setSuggestions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const mod = (n: number, m: number) => ((n % m) + m) % m;
    const canSelect =
      isInputFocused && suggestions.length > 0 && !props.readOnly && !props.disabled;
    if (canSelect && e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => mod(prev + 1, suggestions.length));
    } else if (canSelect && e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (canSelect && e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      handleSuggestionSelect(highlightedIndex);
    }
    onKeyDown?.(e);
    if (e.key === "Enter") e.preventDefault();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsInputFocus(true);
    onChange?.(e.target.value);
    setInputValue(e.target.value);
  };

  return (
    <Popover
      open={suggestions.length > 0 && isInputFocused && !props.readOnly && !props.disabled}
      onOpenChange={(open) => {
        if (!open) setIsInputFocus(false);
        setHighlightedIndex(-1);
      }}
    >
      <PopoverAnchor asChild ref={inputRef}>
        <Input
          {...props}
          type="text"
          autoComplete="off"
          isError={isError}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            setIsInputFocus(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsInputFocus(false);
            onBlur?.(e);
          }}
          value={inputValue}
          onChange={handleInputChange}
          className={containerClassName}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (e.target === inputRef.current) e.preventDefault();
        }}
        className="p-1"
        style={{
          width: "var(--radix-popover-trigger-width)",
          maxHeight: "var(--radix-popover-content-available-height)"
        }}
      >
        <div className="max-h-[25vh] thin-scrollbar overflow-y-auto">
          {suggestions.map((suggestion, i) => (
            <button
              type="button"
              key={`secret-path-suggestion-${i + 1}`}
              onMouseDown={(e) => {
                e.preventDefault();
                setHighlightedIndex(i);
                handleSuggestionSelect(i);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm text-foreground transition-colors hover:bg-foreground/10",
                highlightedIndex === i && "bg-foreground/10"
              )}
            >
              <Folder className="size-3.5 text-warning" />
              <span className="truncate">{suggestion}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const SecretPathInputWithProjectContext = ({
  environment,
  ...props
}: Omit<BaseProps, "projectId">) => {
  const { currentProject } = useProject();
  return (
    <SecretPathInputBase
      projectId={currentProject?.id || ""}
      environment={environment ?? currentProject?.environments?.[0]?.slug}
      {...props}
    />
  );
};

export const SecretPathInput = ({ projectId, ...props }: Props) => {
  if (projectId !== undefined) {
    return <SecretPathInputBase projectId={projectId} {...props} />;
  }
  return <SecretPathInputWithProjectContext {...props} />;
};
