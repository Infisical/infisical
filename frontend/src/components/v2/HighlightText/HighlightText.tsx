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
  const searchTerm = highlight.toLowerCase().trim();

  if (!searchTerm) return <span>{text}</span>;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escapedSearchTerm, "gi");

  while (true) {
    const match = regex.exec(text);
    if (match === null) break;

    if (match.index > lastIndex) {
      parts.push(<span key={`pre-${lastIndex}`}>{text.substring(lastIndex, match.index)}</span>);
    }

    parts.push(
      <span key={`match-${match.index}`} className={highlightClassName || "bg-yellow/30"}>
        {text.substring(match.index, match.index + match[0].length)}
      </span>
    );

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={`post-${lastIndex}`}>{text.substring(lastIndex)}</span>);
  }

  return parts;
};
