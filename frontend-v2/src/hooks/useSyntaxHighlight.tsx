import { useCallback } from "react";
import { faCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const REGEX = /([$]{.*?})/g;

export const useSyntaxHighlight = () => {
  const syntaxHighlight = useCallback((text: string, isHidden?: boolean) => {
    if (isHidden) {
      if (!text) {
        return "EMPTY";
      }

      return text
        .split("")
        .slice(0, 200)
        .map((el, i) =>
          el === "\n" ? (
            el
          ) : (
            <FontAwesomeIcon
              key={`${text}_${el}_${i + 1}`}
              className="mr-0.5 text-xxs"
              icon={faCircle}
            />
          )
        );
    }

    // append a space on last new line this to show new line in ui for code component
    const val = text.at(-1) === "\n" ? text.concat(" ") : text;
    if (val?.length === 0) return <span className="font-mono text-bunker-400/80">EMPTY</span>;
    return val?.split(REGEX).map((word, i) =>
      word.match(REGEX) !== null ? (
        <span className="ph-no-capture text-yellow" key={`${val}-${i + 1}`}>
          $&#123;
          <span className="ph-no-capture text-yellow-200/80">{word.slice(2, word.length - 1)}</span>
          &#125;
        </span>
      ) : (
        <span key={`${word}_${i + 1}`} className="ph-no-capture">
          {word}
        </span>
      )
    );
  }, []);

  return syntaxHighlight;
};
