import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import { cn } from "../../utils";

type Props = {
  fields?: number;
  isError?: boolean;
  name: string;
  onChange: (value: string) => void;
  value?: string;
};

type Selection = {
  end: number;
  start: number;
};

export const VerificationCodeInput = ({
  fields = 6,
  isError,
  name,
  onChange,
  value = ""
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const pointerAnchorRef = useRef<number | undefined>(undefined);
  const [isFocused, setIsFocused] = useState(false);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });

  const syncSelection = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    setSelection({
      start: input.selectionStart ?? 0,
      end: input.selectionEnd ?? 0
    });
  }, []);

  useEffect(() => {
    if (!isError) return;

    inputRef.current?.focus();
    inputRef.current?.select();
    syncSelection();
  }, [isError, syncSelection]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || input.value === value) return;

    input.value = value.slice(0, fields);
    input.setSelectionRange(input.value.length, input.value.length);
    syncSelection();
  }, [fields, syncSelection, value]);

  const getPointerCellIndex = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativePosition = (event.clientX - bounds.left) / bounds.width;

    return Math.max(0, Math.min(fields - 1, Math.floor(relativePosition * fields)));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    const input = inputRef.current;
    if (!input) return;

    const cellIndex = getPointerCellIndex(event);
    const selectionStart = Math.min(cellIndex, input.value.length);
    const selectionEnd =
      cellIndex < input.value.length ? Math.min(cellIndex + 1, input.value.length) : selectionStart;

    pointerAnchorRef.current = cellIndex;
    event.currentTarget.setPointerCapture(event.pointerId);
    input.focus();
    input.setSelectionRange(selectionStart, selectionEnd);
    syncSelection();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const anchor = pointerAnchorRef.current;
    if (anchor === undefined) return;

    const input = inputRef.current;
    if (!input) return;

    const cellIndex = getPointerCellIndex(event);
    const start = Math.min(anchor, cellIndex, input.value.length);
    const end = Math.min(Math.max(anchor, cellIndex) + 1, input.value.length);

    input.setSelectionRange(start, end);
    syncSelection();
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerAnchorRef.current === undefined) return;

    pointerAnchorRef.current = undefined;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = inputRef.current;
    if (!input) return;

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      input.setSelectionRange(0, input.value.length);
      syncSelection();
      return;
    }

    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    event.preventDefault();
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;

    if (event.shiftKey) {
      const anchor = input.selectionDirection === "backward" ? end : start;
      const focus = input.selectionDirection === "backward" ? start : end;
      let nextFocus = focus;

      if (event.key === "ArrowLeft") nextFocus = Math.max(0, focus - 1);
      if (event.key === "ArrowRight") nextFocus = Math.min(input.value.length, focus + 1);
      if (event.key === "Home") nextFocus = 0;
      if (event.key === "End") nextFocus = input.value.length;

      input.setSelectionRange(
        Math.min(anchor, nextFocus),
        Math.max(anchor, nextFocus),
        nextFocus < anchor ? "backward" : "forward"
      );
    } else {
      let position = start;

      if (event.key === "ArrowLeft") position = start === end ? Math.max(0, start - 1) : start;
      if (event.key === "ArrowRight") {
        position = start === end ? Math.min(input.value.length, end + 1) : end;
      }
      if (event.key === "Home") position = 0;
      if (event.key === "End") position = input.value.length;

      input.setSelectionRange(position, position);
    }

    syncSelection();
  };

  const activeSlot = Math.min(selection.start, fields - 1);
  const hasSelection = isFocused && selection.start < selection.end;
  const gridClassName = cn(
    "grid w-full grid-cols-6 gap-3 max-sm:gap-2",
    fields === 8 && "grid-cols-8 gap-2 max-sm:gap-1.5"
  );

  return (
    <div
      className="group relative w-full"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className={gridClassName}>
        {Array.from({ length: fields }, (_, index) => {
          const isActive = isFocused && selection.start === selection.end && index === activeSlot;

          return (
            <div
              aria-hidden
              className={cn(
                "relative flex h-[68px] min-w-0 items-center justify-center rounded-md border border-border bg-container font-jetbrains-mono text-xl text-foreground transition-colors max-sm:aspect-square max-sm:h-auto",
                "group-hover:border-foreground/20",
                isActive &&
                  "border-project/45 outline outline-1 outline-offset-4 outline-project/45",
                isError && "border-danger/55"
              )}
              key={index}
            >
              {value[index] ?? ""}
              {isActive && (
                <span
                  className={cn(
                    "absolute top-1/2 h-6 w-px -translate-y-1/2 bg-foreground motion-safe:animate-pulse",
                    !value[index] && "left-1/2",
                    value[index] &&
                      (selection.start > index
                        ? "left-[calc(50%+0.4rem)]"
                        : "left-[calc(50%-0.4rem)]")
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      {hasSelection && (
        <div
          aria-hidden
          className={cn("pointer-events-none absolute inset-0 z-[1]", gridClassName)}
        >
          <div
            className={cn(
              "rounded-md outline outline-1 outline-offset-4",
              isError ? "outline-danger/55" : "outline-project/45"
            )}
            style={{ gridColumn: `${selection.start + 1} / ${selection.end + 1}` }}
          />
        </div>
      )}
      <input
        ref={inputRef}
        aria-invalid={isError}
        aria-label={fields === 8 ? "Recovery code" : "Verification code"}
        autoCapitalize="off"
        autoComplete="one-time-code"
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
        defaultValue={value}
        inputMode={fields === 6 ? "numeric" : "text"}
        maxLength={fields}
        name={name}
        onBlur={() => setIsFocused(false)}
        onChange={(event) => {
          const nextValue = (
            fields === 6 ? event.target.value.replace(/\D/g, "") : event.target.value
          ).slice(0, fields);

          event.target.value = nextValue;
          const nextSelectionStart = Math.min(
            event.target.selectionStart ?? nextValue.length,
            nextValue.length
          );
          const nextSelectionEnd = Math.min(
            event.target.selectionEnd ?? nextSelectionStart,
            nextValue.length
          );

          setSelection({ start: nextSelectionStart, end: nextSelectionEnd });
          onChange(nextValue);
        }}
        onFocus={() => {
          setIsFocused(true);
          syncSelection();
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={syncSelection}
        onSelect={syncSelection}
        spellCheck={false}
        type="text"
      />
    </div>
  );
};
