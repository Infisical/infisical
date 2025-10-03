export const HighlightText = ({
  text,
  highlight,
  highlightClassName
}: {
  text: string | undefined | null;
  highlight: string;
  highlightClassName?: string;
}) => {
  if (!text) return null;

  const renderTextWithNewlines = (input: string, baseKeyPrefix: string = ""): React.ReactNode[] => {
    if (!input) return [];
    const lines = input.split("\n");
    return lines.flatMap((line, index) => {
      const nodes: React.ReactNode[] = [line];
      if (index < lines.length - 1) {
        nodes.push(<br key={`${baseKeyPrefix}-br-${line}`} />);
      }
      return nodes;
    });
  };

  const searchTerm = highlight.toLowerCase().trim();

  if (!searchTerm) {
    return <span>{renderTextWithNewlines(text, "full-text")}</span>;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escapedSearchTerm, "gi");

  text.replace(regex, (match: string, offset: number) => {
    if (offset > lastIndex) {
      const preMatchText = text.substring(lastIndex, offset);
      parts.push(
        <span key={`pre-${lastIndex}`}>
          {renderTextWithNewlines(preMatchText, `pre-${lastIndex}`)}
        </span>
      );
    }

    parts.push(
      <span key={`match-${offset}`} className={highlightClassName || "bg-yellow/30"}>
        {renderTextWithNewlines(match, `match-${offset}`)}
      </span>
    );

    lastIndex = offset + match.length;

    return match;
  });

  if (lastIndex < text.length) {
    const postMatchText = text.substring(lastIndex);
    parts.push(
      <span key={`post-${lastIndex}`}>
        {renderTextWithNewlines(postMatchText, `post-${lastIndex}`)}
      </span>
    );
  }

  return parts;
};
