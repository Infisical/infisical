import { useRef } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { useSyntaxHighlight, useToggle } from "@app/hooks";

import { FormData } from "../../DashboardPage.utils";

type Props = {
  isReadOnly?: boolean;
  isSecretValueHidden?: boolean;
  isOverridden?: boolean;
  index: number;
};

const SEC_VAL_LINE_HEIGHT = 21;
const MAX_MULTI_LINE = 6;

export const MaskedInput = ({ isReadOnly, isSecretValueHidden, index, isOverridden }: Props) => {
  const { control } = useFormContext<FormData>();
  const ref = useRef<HTMLElement | null>(null);
  const [isFocused, setIsFocused] = useToggle();
  const syntaxHighlight = useSyntaxHighlight();

  const secretValue = useWatch({ control, name: `secrets.${index}.value` });
  const secretValueOverride = useWatch({ control, name: `secrets.${index}.valueOverride` });
  const value = isOverridden ? secretValueOverride : secretValue;

  const multilineExpandUnit = ((value?.match(/\n/g)?.length || 0) + 1) * SEC_VAL_LINE_HEIGHT;
  const maxMultilineHeight = Math.min(multilineExpandUnit, 21 * MAX_MULTI_LINE);

  return (
    <div className="group relative flex w-full flex-col whitespace-pre px-1.5 pt-1.5">
      {isOverridden ? (
        <Controller
          control={control}
          name={`secrets.${index}.valueOverride`}
          render={({ field }) => (
            <textarea
              key={`secrets.${index}.valueOverride`}
              {...field}
              readOnly={isReadOnly}
              className="ph-no-capture min-w-16 duration-50 peer z-20 w-full resize-none overflow-auto text-ellipsis bg-transparent px-2  font-mono text-sm text-transparent caret-white outline-none no-scrollbar"
              style={{ height: `${maxMultilineHeight}px` }}
              spellCheck="false"
              onBlur={() => setIsFocused.off()}
              onFocus={() => setIsFocused.on()}
              onInput={(el) => {
                if (ref.current) {
                  ref.current.scrollTop = el.currentTarget.scrollTop;
                  ref.current.scrollLeft = el.currentTarget.scrollLeft;
                }
              }}
              onScroll={(el) => {
                if (ref.current) {
                  ref.current.scrollTop = el.currentTarget.scrollTop;
                  ref.current.scrollLeft = el.currentTarget.scrollLeft;
                }
              }}
            />
          )}
        />
      ) : (
        <Controller
          control={control}
          name={`secrets.${index}.value`}
          key={`secrets.${index}.value`}
          render={({ field }) => (
            <textarea
              {...field}
              readOnly={isReadOnly}
              className="ph-no-capture min-w-16 duration-50 peer z-20 w-full resize-none overflow-auto text-ellipsis bg-transparent px-2 font-mono text-sm text-transparent caret-white outline-none no-scrollbar"
              style={{ height: `${maxMultilineHeight}px` }}
              spellCheck="false"
              onBlur={() => setIsFocused.off()}
              onFocus={() => setIsFocused.on()}
              onInput={(el) => {
                if (ref.current) {
                  ref.current.scrollTop = el.currentTarget.scrollTop;
                  ref.current.scrollLeft = el.currentTarget.scrollLeft;
                }
              }}
              onScroll={(el) => {
                if (ref.current) {
                  ref.current.scrollTop = el.currentTarget.scrollTop;
                  ref.current.scrollLeft = el.currentTarget.scrollLeft;
                }
              }}
            />
          )}
        />
      )}
      <pre className="whitespace-pre-wrap break-words">
        <code
          ref={ref}
          className={`absolute top-1.5 left-3.5 z-10 w-full overflow-auto font-mono text-sm transition-all no-scrollbar ${
            isOverridden && "text-primary-300"
          } ${
            (value || "") === "" && "text-mineshaft-400"
          }`}
          style={{ height: `${maxMultilineHeight}px`, width: "calc(100% - 12px)" }}
        >
          {syntaxHighlight(value || "", isSecretValueHidden ? !isFocused : isSecretValueHidden)}
        </code>
      </pre>
    </div>
  );
};
