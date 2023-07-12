/* eslint-disable react/jsx-no-useless-fragment */
import { useCallback, useRef, useState } from "react";
import { faEye, faEyeSlash, faKey, faMinus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useSyntaxHighlight } from "@app/hooks";
import { useToggle } from "@app/hooks/useToggle";

type Props = {
  secrets: any[] | undefined;
  // permission and external state's that decided to hide or show
  isReadOnly?: boolean;
  isSecretValueHidden: boolean;
  userAvailableEnvs?: any[];
};

const SEC_VAL_LINE_HEIGHT = 21;
const MAX_MULTI_LINE = 6;

const DashboardInput = ({
  isOverridden,
  isSecretValueHidden,
  secret,
  isReadOnly = true
}: {
  isOverridden: boolean;
  isSecretValueHidden: boolean;
  isReadOnly?: boolean;
  secret?: any;
}): JSX.Element => {
  const ref = useRef<HTMLElement | null>(null);
  const [isFocused, setIsFocused] = useToggle();
  const syntaxHighlight = useSyntaxHighlight();

  const value = isOverridden ? secret.valueOverride : secret?.value;
  const multilineExpandUnit = ((value?.match(/\n/g)?.length || 0) + 1) * SEC_VAL_LINE_HEIGHT;
  const maxMultilineHeight = Math.min(multilineExpandUnit, 21 * MAX_MULTI_LINE);

  return (
    <td
      key={`row-${secret?.key || ""}--`}
      className={`flex w-full cursor-default flex-row ${
        !(secret?.value || secret?.value === "") ? "bg-red-800/10" : "bg-mineshaft-900/30"
      }`}
    >
      <div className="group relative flex w-full flex-col whitespace-pre px-1.5 pt-1.5">
        <textarea
          readOnly={isReadOnly}
          value={value}
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
        <pre className="whitespace-pre-wrap break-words">
          <code
            ref={ref}
            className={`absolute top-1.5 left-3.5 z-10 overflow-auto font-mono text-sm transition-all no-scrollbar ${
              isOverridden && "text-primary-300"
            } ${
              (value || "") === "" && "text-mineshaft-400"
            }`}
            style={{ height: `${maxMultilineHeight}px`, width: "calc(100% - 12px)" }}
          >
            {value === undefined ? (
              <span className="cursor-default font-sans text-xs italic text-red-500/80">
                <FontAwesomeIcon icon={faMinus} className="mt-1" />
              </span>
            ) : (
              syntaxHighlight(value || "", isSecretValueHidden ? !isFocused : isSecretValueHidden)
            )}
          </code>
        </pre>
      </div>
    </td>
  );
};

export const EnvComparisonRow = ({
  secrets,
  isSecretValueHidden,
  isReadOnly,
  userAvailableEnvs
}: Props): JSX.Element => {
  const [areValuesHiddenThisRow, setAreValuesHiddenThisRow] = useState(true);

  const getSecretByEnv = useCallback(
    (secEnv: string, secs?: any[]) => secs?.find(({ env }) => env === secEnv),
    []
  );

  return (
    <tr className="group flex min-w-full flex-row hover:bg-mineshaft-800">
      <td className="flex w-10 justify-center border-none px-4">
        <div className="flex h-8 w-10 items-center justify-center text-center text-xs text-bunker-400">
          <FontAwesomeIcon icon={faKey} />
        </div>
      </td>
      <td className="flex min-w-[200px] flex-row justify-between lg:min-w-[220px] xl:min-w-[250px]">
        <div className="flex h-8 cursor-default flex-row items-center justify-center truncate">
          {secrets![0].key || ""}
        </div>
        <button
          type="button"
          className="invisible mr-1 ml-2 text-bunker-400 hover:text-bunker-300 group-hover:visible"
          onClick={() => setAreValuesHiddenThisRow(!areValuesHiddenThisRow)}
        >
          <FontAwesomeIcon icon={areValuesHiddenThisRow ? faEye : faEyeSlash} />
        </button>
      </td>
      {userAvailableEnvs?.map(({ slug }) => (
        <DashboardInput
          isReadOnly={isReadOnly}
          key={`row-${secrets![0].key || ""}-${slug}`}
          isOverridden={false}
          secret={getSecretByEnv(slug, secrets)}
          isSecretValueHidden={areValuesHiddenThisRow && isSecretValueHidden}
        />
      ))}
    </tr>
  );
};
