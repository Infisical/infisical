type Props = {
  className?: string;
};

export const LiveDot = ({ className = "bg-success" }: Props) => (
  <span className="relative mr-1.5 flex size-1.5">
    <span
      className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${className}`}
    />
    <span className={`relative inline-flex size-1.5 rounded-full ${className}`} />
  </span>
);
