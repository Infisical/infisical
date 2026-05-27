import { InputHTMLAttributes, useEffect, useState } from "react";
import { Folder } from "lucide-react";

import { useProject } from "@app/context";
import { useDebounce } from "@app/hooks";
import { useGetFoldersByEnv } from "@app/hooks/api";

import { Input } from "../../generic/Input";
import { Popover, PopoverContent, PopoverTrigger } from "../../generic/Popover";
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
  ...props
}: BaseProps) => {
  const [inputValue, setInputValue] = useState(propValue ?? "");
  const [secretPath, setSecretPath] = useState("/");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isInputFocused, setIsInputFocus] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [debouncedInputValue] = useDebounce(inputValue, 200);
  const { folderNames: folders } = useGetFoldersByEnv({
    path: secretPath,
    environments: [environment || ""],
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
    if (e.key === "ArrowDown") {
      setHighlightedIndex((prev) => mod(prev + 1, suggestions.length));
    } else if (e.key === "ArrowUp") {
      setHighlightedIndex((prev) => mod(prev - 1, suggestions.length));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      handleSuggestionSelect(highlightedIndex);
    }
    if (["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
      e.preventDefault();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value);
    setInputValue(e.target.value);
  };

  return (
    <Popover
      open={suggestions.length > 0 && isInputFocused}
      onOpenChange={() => setHighlightedIndex(-1)}
    >
      <PopoverTrigger asChild>
        <Input
          {...props}
          type="text"
          autoComplete="off"
          isError={isError}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsInputFocus(true)}
          onBlur={() => setIsInputFocus(false)}
          value={inputValue}
          onChange={handleInputChange}
          className={containerClassName}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
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
      environment={environment || currentProject?.environments?.[0].slug}
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
