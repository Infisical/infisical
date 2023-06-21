/* eslint-disable react/jsx-no-useless-fragment */
import { useCallback, useState } from "react";
import { faCircle, faEye, faEyeSlash, faKey, faMinus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

type Props = {
  secrets: any[] | undefined;
  // permission and external state's that decided to hide or show
  isReadOnly?: boolean;
  isSecretValueHidden: boolean;
  userAvailableEnvs?: any[];
};

const REGEX = /([$]{.*?})/g;

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
  const syntaxHighlight = useCallback((val: string) => {
    if (val === undefined)
      return (
        <span className="cursor-default font-sans text-xs italic text-red-500/80">
          <FontAwesomeIcon icon={faMinus} className="mt-1" />
        </span>
      );
    if (val?.length === 0)
      return <span className="w-full font-sans text-bunker-400/80">EMPTY</span>;
    return val?.split(REGEX).map((word, index) =>
      word.match(REGEX) !== null ? (
        <span className="ph-no-capture text-yellow" key={`${val}-${index + 1}`}>
          {word.slice(0, 2)}
          <span className="ph-no-capture text-yellow-200/80">{word.slice(2, word.length - 1)}</span>
          {word.slice(word.length - 1, word.length) === "}" ? (
            <span className="ph-no-capture text-yellow">
              {word.slice(word.length - 1, word.length)}
            </span>
          ) : (
            <span className="ph-no-capture text-yellow-400">
              {word.slice(word.length - 1, word.length)}
            </span>
          )}
        </span>
      ) : (
        <span key={word} className="ph-no-capture">
          {word}
        </span>
      )
    );
  }, []);

  return (
    <td
      key={`row-${secret?.key || ""}--`}
      className={`flex h-10 w-full cursor-default flex-row items-center justify-center ${
        !(secret?.value || secret?.value === "") ? "bg-red-800/10" : "bg-mineshaft-900/30"
      }`}
    >
      <div className="group relative flex	w-full cursor-default flex-col justify-center whitespace-pre">
        <input
          value={isOverridden ? secret.valueOverride : secret?.value || ""}
          readOnly={isReadOnly}
          className={twMerge(
            "ph-no-capture no-scrollbar::-webkit-scrollbar duration-50 peer z-10 w-full cursor-default bg-transparent px-2 py-2 font-mono text-sm text-transparent caret-transparent outline-none no-scrollbar",
            isSecretValueHidden && "text-transparent focus:text-transparent active:text-transparent"
          )}
          spellCheck="false"
        />
        <div
          className={twMerge(
            "ph-no-capture min-w-16 no-scrollbar::-webkit-scrollbar duration-50 absolute z-0 mt-0.5 flex h-10 w-full cursor-default flex-row overflow-x-scroll whitespace-pre bg-transparent px-2 py-2 font-mono text-sm outline-none no-scrollbar peer-focus:visible",
            isSecretValueHidden && secret?.value ? "invisible" : "visible",
            isSecretValueHidden &&
              secret?.value &&
              "duration-50 text-bunker-800 group-hover:text-gray-400 peer-focus:text-gray-100 peer-active:text-gray-400",
            !secret?.value && "justify-center text-bunker-400"
          )}
        >
          {syntaxHighlight(secret?.value)}
        </div>
        {isSecretValueHidden && secret?.value && (
          <div className="duration-50 peer absolute z-0 flex h-10 w-full flex-row items-center justify-between text-clip pr-2 text-bunker-400 group-hover:bg-white/[0.00] peer-focus:hidden peer-active:hidden">
            <div className="no-scrollbar::-webkit-scrollbar flex flex-row items-center overflow-x-scroll px-2 no-scrollbar">
              {(isOverridden ? secret.valueOverride : secret?.value || "")
                ?.split("")
                .map((_a: string, index: number) => (
                  <FontAwesomeIcon
                    key={`${secret?.value}_${index + 1}`}
                    className="mr-0.5 text-xxs"
                    icon={faCircle}
                  />
                ))}
              {(isOverridden ? secret.valueOverride : secret?.value || "")?.split("").length ===
                0 && <span className="text-sm text-bunker-400/80">EMPTY</span>}
            </div>
          </div>
        )}
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
    <tr className="group flex min-w-full flex-row items-center hover:bg-mineshaft-800">
      <td className="flex h-10 w-10 items-center justify-center border-none px-4">
        <div className="w-10 text-center text-xs text-bunker-400">
          <FontAwesomeIcon icon={faKey} />
        </div>
      </td>
      <td className="flex h-full min-w-[200px] flex-row items-center justify-between lg:min-w-[220px] xl:min-w-[250px]">
        <div className="flex h-8 cursor-default flex-row items-center truncate">
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
