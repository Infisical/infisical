import { type KeyboardEvent, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@infisical/cipher/ui/command";
import { Icon } from "@infisical/cipher/ui/icon";
import { Popover, PopoverAnchor, PopoverContent } from "@infisical/cipher/ui/popover";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { Meta } from "@infisical/cipher/ui/text";

import { UNCHANGED_SECRET } from "@app/components/agent-vault/service-sheet/serviceSchema";
import {
  findVariableReferenceAtCaret,
  normalizeVariableKey,
  toVariableReference,
  VARIABLE_KEY_RE
} from "@app/helpers/agentVaultVariables";
import { AgentVaultVariableScope } from "@app/hooks/api/agentVault/enums";
import { useDebounce } from "@app/hooks/useDebounce";

import { useV4Adapter } from "../../data/adapters";
import { VariableDialog } from "./variable-dialog";

import css from "./resources.module.css";

const SUGGESTION_LIMIT = 50;
const CREATE = "create";

type TOpenReference = { start: number; end: number; query: string };

export const VariableSecretInput = ({
  projectId,
  label,
  value,
  hasStored,
  invalid,
  placeholder,
  multiline,
  allowsVariables = true,
  onChange
}: {
  projectId: string;
  label: string;
  value: string | undefined;
  hasStored: boolean;
  invalid: boolean;
  placeholder?: string;
  multiline?: boolean;
  allowsVariables?: boolean;
  onChange: (value: string) => void;
}) => {
  const resources = useV4Adapter("agentVaultResources");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [reference, setReference] = useState<TOpenReference | null>(null);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState<{ key: string; before: string; after: string } | null>(
    null
  );
  const dismissedAt = useRef<number | null>(null);
  const shown = value === UNCHANGED_SECRET ? "" : (value ?? "");
  const query = reference ? normalizeVariableKey(reference.query) : "";
  const [debouncedQuery] = useDebounce(query, 200);
  const isOpen = Boolean(reference);

  const { data } = resources.useVariables(
    projectId,
    {
      scope: AgentVaultVariableScope.Global,
      search: debouncedQuery || undefined,
      limit: SUGGESTION_LIMIT
    },
    { enabled: isOpen }
  );
  const { existing } = resources.useVariableKeyStatus(
    projectId,
    isOpen && VARIABLE_KEY_RE.test(debouncedQuery) ? [debouncedQuery] : []
  );

  const keyExists =
    existing.has(query) || Boolean(data?.variables.some((variable) => variable.key === query));
  const rank = (candidate: string) => {
    if (candidate === query) return 0;
    return candidate.startsWith(query) ? 1 : 2;
  };
  const matches = [
    ...new Set([
      ...(keyExists ? [query] : []),
      ...(data?.variables ?? [])
        .map((variable) => variable.key)
        .filter((candidate) => candidate.includes(query))
    ])
  ].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const usedBy = (key: string) =>
    data?.variables.find((variable) => variable.key === key)?.usedByServices.length;
  const canCreate = Boolean(query) && !keyExists;
  const options = [...matches, ...(canCreate ? [CREATE] : [])];
  const activeValue = options[Math.min(active, options.length - 1)];
  const truncated = data && data.totalCount > matches.length ? data.totalCount : null;

  const change = (next: string) => onChange(next === "" && hasStored ? UNCHANGED_SECRET : next);

  const refresh = () => {
    if (!allowsVariables) return;
    const input = inputRef.current;
    const caret = input?.selectionStart ?? null;
    const next =
      input && caret !== null && caret === input.selectionEnd
        ? findVariableReferenceAtCaret(input.value, caret)
        : null;
    if (!next) {
      dismissedAt.current = null;
      setReference(null);
      return;
    }
    if (next.start === dismissedAt.current) return;
    if (reference?.start !== next.start || reference.query !== next.query) {
      setReference(next);
      setActive(0);
    }
  };

  const insert = (key: string, before: string, after: string) => {
    const text = toVariableReference(key);
    onChange(before + text + after);
    const caret = before.length + text.length;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret, caret);
    });
  };

  const choose = (option: string) => {
    if (!reference) return;
    const before = shown.slice(0, reference.start);
    const after = shown.slice(reference.end);
    setReference(null);
    if (option === CREATE) {
      setCreating({ key: VARIABLE_KEY_RE.test(query) ? query : "", before, after });
      return;
    }
    insert(option, before, after);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!reference || !options.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + options.length) % options.length);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismissedAt.current = reference.start;
      setReference(null);
      return;
    }
    if (event.key === "Enter" || (event.key === "Tab" && activeValue !== CREATE)) {
      event.preventDefault();
      choose(activeValue);
    }
  };

  return (
    <>
      <Popover
        open={isOpen}
        onOpenChange={(open) => {
          if (open || !reference) return;
          dismissedAt.current = reference.start;
          setReference(null);
        }}
      >
        <PopoverAnchor asChild>
          <div>
            <SecretInput
              ref={inputRef}
              aria-label={label}
              multiline={multiline}
              placeholder={hasStored ? "Leave blank to keep the current value" : placeholder}
              value={shown}
              invalid={invalid}
              onChange={(next) => {
                change(next);
                requestAnimationFrame(refresh);
              }}
              onSelect={refresh}
              onKeyDown={onKeyDown}
              onBlur={() => setReference(null)}
            />
          </div>
        </PopoverAnchor>
        {isOpen && (
          <PopoverContent
            surface="menu"
            align="start"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onMouseDown={(event) => event.preventDefault()}
          >
            <Command shouldFilter={false} value={activeValue} label="Variables">
              <CommandList>
                <CommandEmpty>{data ? "No variables yet" : "Loading variables..."}</CommandEmpty>
                {matches.length > 0 && (
                  <CommandGroup>
                    {matches.map((key, index) => {
                      const count = usedBy(key);
                      return (
                        <CommandItem
                          key={key}
                          value={key}
                          onMouseMove={() => setActive(index)}
                          onSelect={() => choose(key)}
                        >
                          <span className={css.variableKey}>{key}</span>
                          {count !== undefined && (
                            <Meta mono={false}>
                              {count === 0
                                ? "Unused"
                                : `Used by ${count} service${count === 1 ? "" : "s"}`}
                            </Meta>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
                {canCreate && (
                  <>
                    {matches.length > 0 && <CommandSeparator />}
                    <CommandGroup>
                      <CommandItem
                        value={CREATE}
                        onMouseMove={() => setActive(matches.length)}
                        onSelect={() => choose(CREATE)}
                      >
                        <Icon name="plus" />
                        {VARIABLE_KEY_RE.test(query) ? `Create ${query}` : "Create variable"}
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
                {truncated && (
                  <CommandGroup
                    heading={`Showing ${matches.length} of ${truncated}. Keep typing to narrow the list.`}
                  />
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        )}
      </Popover>
      {creating && (
        <VariableDialog
          projectId={projectId}
          scope={AgentVaultVariableScope.Global}
          initialKey={creating.key}
          onCreated={(variable) => insert(variable.key, creating.before, creating.after)}
          onOpenChange={(open) => {
            if (!open) setCreating(null);
          }}
        />
      )}
    </>
  );
};
