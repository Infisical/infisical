import { type ComponentProps, createContext, useContext } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import { CheckIcon } from "lucide-react";
import remarkGfm from "remark-gfm";

import { cn } from "../../utils";

type MarkdownProps = {
  /**
   * Markdown source, with GitHub's additions (tables, strikethrough, task lists, autolinks). Raw HTML in it is left
   * out, and images show their alt text rather than loading.
   */
  children: string;
  className?: string;
  /**
   * Called with the href of a link that has no scheme, such as `references/guide.md` or `#usage`, on a click or
   * middle-click, instead of the browser following it. Without it such a link resolves against the app's URL and
   * lands on a missing page.
   */
  onRelativeLinkClick?: (href: string) => void;
};

const linkClassName = "text-info underline underline-offset-4 hover:text-info/80";

const isAbsoluteHref = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");

const RelativeLinkContext = createContext<MarkdownProps["onRelativeLinkClick"]>(undefined);

const MarkdownLink = ({
  node,
  className,
  children,
  href,
  ...props
}: ComponentProps<"a"> & ExtraProps) => {
  const onRelativeLinkClick = useContext(RelativeLinkContext);
  if (onRelativeLinkClick && href && !isAbsoluteHref(href)) {
    // The real href would still reach the browser through "Open in new tab" and copy link, so it stays out of the
    // anchor; "#" keeps the link focusable and opens this same page at worst.
    return (
      <a
        className={cn(linkClassName, className)}
        href="#"
        {...props}
        onClick={(event) => {
          event.preventDefault();
          onRelativeLinkClick(href);
        }}
        onAuxClick={(event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          onRelativeLinkClick(href);
        }}
      >
        {children}
      </a>
    );
  }
  return (
    <a
      className={cn(linkClassName, className)}
      target="_blank"
      rel="noopener noreferrer"
      href={href}
      {...props}
    >
      {children}
    </a>
  );
};

const components: Components = {
  h1: ({ node, className, children, ...props }) => (
    <h1 className={cn("mt-6 mb-3 font-alliance text-2xl first:mt-0", className)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ node, className, children, ...props }) => (
    <h2 className={cn("mt-6 mb-3 font-alliance text-xl first:mt-0", className)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ node, className, children, ...props }) => (
    <h3 className={cn("mt-5 mb-2 font-alliance text-lg first:mt-0", className)} {...props}>
      {children}
    </h3>
  ),
  h4: ({ node, className, children, ...props }) => (
    <h4 className={cn("mt-4 mb-2 font-alliance text-base first:mt-0", className)} {...props}>
      {children}
    </h4>
  ),
  h5: ({ node, className, children, ...props }) => (
    <h5 className={cn("mt-4 mb-2 font-alliance text-sm first:mt-0", className)} {...props}>
      {children}
    </h5>
  ),
  h6: ({ node, className, children, ...props }) => (
    <h6
      className={cn("mt-4 mb-2 font-alliance text-sm text-label first:mt-0", className)}
      {...props}
    >
      {children}
    </h6>
  ),
  p: ({ node, className, ...props }) => (
    <p className={cn("my-3 leading-relaxed first:mt-0 last:mb-0", className)} {...props} />
  ),
  a: MarkdownLink,
  ul: ({ node, className, ...props }) => (
    <ul
      className={cn(
        "my-3 list-disc space-y-1 pl-6 [&.contains-task-list]:list-none [&.contains-task-list]:pl-1",
        className
      )}
      {...props}
    />
  ),
  ol: ({ node, className, ...props }) => (
    <ol className={cn("my-3 list-decimal space-y-1 pl-6", className)} {...props} />
  ),
  li: ({ node, className, ...props }) => (
    <li
      className={cn("leading-relaxed marker:text-muted [&.task-list-item]:list-none", className)}
      {...props}
    />
  ),
  input: ({ node, type, checked, className, ...props }) =>
    type === "checkbox" ? (
      <span
        role="checkbox"
        aria-checked={Boolean(checked)}
        aria-disabled
        className={cn(
          "mr-2 inline-flex size-3.5 translate-y-0.5 items-center justify-center rounded-[4px] border border-foreground/15 align-baseline text-foreground",
          checked && "border-foreground/25 bg-foreground/10",
          className
        )}
      >
        {checked && <CheckIcon className="size-3" />}
      </span>
    ) : (
      <input type={type} checked={checked} className={className} {...props} />
    ),
  del: ({ node, className, ...props }) => (
    <del className={cn("text-label line-through", className)} {...props} />
  ),
  table: ({ node, className, ...props }) => (
    <div className="my-3 thin-scrollbar overflow-x-auto rounded-md border border-border">
      <table className={cn("w-max min-w-full text-start text-sm", className)} {...props} />
    </div>
  ),
  thead: ({ node, className, ...props }) => (
    <thead className={cn("bg-container", className)} {...props} />
  ),
  tr: ({ node, className, ...props }) => (
    <tr className={cn("border-b border-border last:border-b-0", className)} {...props} />
  ),
  th: ({ node, className, ...props }) => (
    <th
      className={cn("px-3 py-2 text-start align-bottom text-xs font-medium text-accent", className)}
      {...props}
    />
  ),
  td: ({ node, className, ...props }) => (
    <td className={cn("px-3 py-2 align-top", className)} {...props} />
  ),
  blockquote: ({ node, className, ...props }) => (
    <blockquote
      className={cn("my-3 border-l-2 border-border pl-4 text-label italic", className)}
      {...props}
    />
  ),
  hr: ({ node, className, ...props }) => (
    <hr className={cn("my-6 border-border", className)} {...props} />
  ),
  pre: ({ node, className, ...props }) => (
    <pre
      className={cn(
        "my-3 thin-scrollbar overflow-x-auto rounded-md border border-border bg-container p-3 font-mono text-xs leading-relaxed [&>code]:bg-transparent [&>code]:p-0",
        className
      )}
      {...props}
    />
  ),
  code: ({ node, className, ...props }) => (
    <code
      className={cn("rounded-sm bg-container px-1 py-0.5 font-mono text-[0.85em]", className)}
      {...props}
    />
  ),
  img: ({ alt, src }) => (
    <span className="text-muted" title={typeof src === "string" ? src : undefined}>
      [{alt || "image"}]
    </span>
  )
};

const Markdown = ({ children, className, onRelativeLinkClick }: MarkdownProps) => (
  <RelativeLinkContext.Provider value={onRelativeLinkClick}>
    <div data-slot="markdown" className={cn("min-w-0 text-sm text-foreground", className)}>
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  </RelativeLinkContext.Provider>
);

export { Markdown, type MarkdownProps };
