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

  if (!searchTerm) {
    return <span>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escapedSearchTerm, "gi");

  text.replace(regex, (match: string, offset: number) => {
    if (offset > lastIndex) {
      const preMatchText = text.substring(lastIndex, offset);
      parts.push(<span key={`pre-${lastIndex}`}>{preMatchText}</span>);
    }

    parts.push(
      <span key={`match-${offset}`} className={highlightClassName || "bg-yellow/30"}>
        {match}
      </span>
    );

    lastIndex = offset + match.length;

    return match;
  });

  if (lastIndex < text.length) {
    const postMatchText = text.substring(lastIndex);
    parts.push(<span key={`post-${lastIndex}`}>{postMatchText}</span>);
  }

  return parts;
};
