/* eslint-disable react/no-danger */
import { forwardRef, TextareaHTMLAttributes } from "react";
import { faChevronRight, faFolder, faKey, faRecycle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { useToggle } from "@app/hooks";

const REGEX = /(\${([^}]+)})/g;
const replaceContentWithDot = (str: string) => {
  let finalStr = "";
  for (let i = 0; i < str.length; i += 1) {
    const char = str.at(i);
    finalStr += char === "\n" ? "\n" : "*";
  }
  return finalStr;
};

const syntaxHighlight = (content?: string | null, isVisible?: boolean) => {
  if (content === "") return "EMPTY";
  if (!content) return "EMPTY";
  if (!isVisible) return replaceContentWithDot(content);

  // List all the all the variable and the enviroments
  // On Environment select list all the secret name and folder
  //

  let skipNext = false;
  const formatedContent = content.split(REGEX).flatMap((el, i) => {
    const isInterpolationSyntax = el.startsWith("${") && el.endsWith("}");
    if (isInterpolationSyntax) {
      skipNext = true;
      return (
        <span className="ph-no-capture text-yellow" key={`secret-value-${i + 1}`}>
          &#36;&#123;<span className="ph-no-capture text-yello-200/80">{el.slice(2, -1)}</span>
          &#125;
        </span>
      );
    }
    if (skipNext) {
      skipNext = false;
      return [];
    }
    return el;
  });

  // akhilmhdh: Dont remove this br. I am still clueless how this works but weirdly enough
  // when break is added a line break works properly
  return formatedContent.concat(<br />);
};

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value?: string | null;
  isVisible?: boolean;
  isReadOnly?: boolean;
  isDisabled?: boolean;
  containerClassName?: string;
};

const commonClassName = "font-mono text-sm caret-white border-none outline-none w-full break-all";

export const SecretInput = forwardRef<HTMLTextAreaElement, Props>(
  (
    { value, isVisible, containerClassName, onBlur, isDisabled, isReadOnly, onFocus, ...props },
    ref
  ) => {
    const [isSecretFocused, setIsSecretFocused] = useToggle();

    return (
      // <>
      <div
        className={twMerge("w-full overflow-auto rounded-md no-scrollbar", containerClassName)}
        style={{ maxHeight: `${21 * 7}px` }}
      >
        <div className="relative overflow-hidden">
          <pre aria-hidden className="m-0 ">
            <code className={`inline-block w-full  ${commonClassName}`}>
              <span style={{ whiteSpace: "break-spaces" }}>
                {syntaxHighlight(value, isVisible || isSecretFocused)}
              </span>
            </code>
          </pre>

          <textarea
            style={{ whiteSpace: "break-spaces" }}
            aria-label="secret value"
            ref={ref}
            className={`absolute inset-0 block h-full resize-none overflow-hidden bg-transparent text-transparent no-scrollbar focus:border-0 ${commonClassName}`}
            onFocus={() => setIsSecretFocused.on()}
            disabled={isDisabled}
            spellCheck={false}
            onBlur={(evt) => {
              onBlur?.(evt);
              setIsSecretFocused.off();
            }}
            value={value || ""}
            {...props}
            readOnly={isReadOnly}
          />
        </div>

        <div className="absolute z-10 w-60 rounded-md border border-mineshaft-600 bg-mineshaft-700 text-sm text-bunker-200">
          <div className="z-10 h-full w-60 flex-col items-center justify-center rounded-md py-4 text-white">
            {[
              { name: "SECRET NAME", type: "secret" },
              { name: "Folder", type: "folder" },
              { name: "Development", type: "environment" }
            ].map((e, i) => {
              return (
                <div
                  className="flex items-center justify-between border-b border-mineshaft-600 px-2 py-1 last:border-b-0"
                  key={`key-${i + 1}`}
                >
                  {e.type === "folder" && (
                    <>
                      <div className="flex gap-2">
                        <div className="flex items-center text-yellow-700">
                          <FontAwesomeIcon icon={faFolder} />
                        </div>
                        <div>{e.name}</div>
                      </div>
                      <div className="flex items-center text-bunker-200">
                        <FontAwesomeIcon icon={faChevronRight} />
                      </div>
                    </>
                  )}

                  {e.type === "environment" && (
                    <>
                      <div className="flex gap-2">
                        <div className="flex items-center text-yellow-700">
                          <FontAwesomeIcon icon={faRecycle} />
                        </div>
                        <div>{e.name}</div>
                      </div>
                      <div className="flex items-center text-bunker-200">
                        <FontAwesomeIcon icon={faChevronRight} />
                      </div>
                    </>
                  )}

                  {e.type === "secret" && (
                    <div className="flex gap-2">
                      <div className="flex items-center text-yellow-700">
                        <FontAwesomeIcon icon={faKey} />
                      </div>
                      <div>{e.name}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
);

SecretInput.displayName = "SecretInput";
