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

  for (const match of text.matchAll(regex)) {
    if (match.index > lastIndex) {
      parts.push(<span key={`pre-${lastIndex}`}>{text.substring(lastIndex, match.index)}</span>);
    }

    parts.push(
      <span key={`match-${match.index}`} className={highlightClassName || "bg-yellow/30"}>
        {match[0]}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={`post-${lastIndex}`}>{text.substring(lastIndex)}</span>);
  }

  return parts;
};
