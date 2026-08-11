import { useEffect, useRef, useState } from "react";
import { MessageSquareIcon, MessageSquarePlusIcon } from "lucide-react";

import {
  IconButton,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";

import { SecretCommentForm } from "./SecretCommentForm";

const commentIndicatorClassName =
  "inline-flex size-7 shrink-0 items-center justify-center text-muted outline-none focus-visible:ring-1 focus-visible:ring-ring [&>svg]:size-4 [&>svg]:stroke-[1.75]";

type Props = {
  comment?: string;
  secretKey: string;
  environment: string;
  secretPath: string;
  isBatchMode?: boolean;
  onCommentChange?: (comment: string) => void;
  isReadOnly?: boolean;
  isUnavailable?: boolean;
};

type SecretCommentSummaryBadgeProps = {
  environments: {
    slug: string;
    name: string;
    comment?: string;
    isReadOnly: boolean;
  }[];
  secretKey: string;
  secretPath: string;
};

export const SecretCommentSummaryBadge = ({
  environments,
  secretKey,
  secretPath
}: SecretCommentSummaryBadgeProps) => {
  const commentedEnvironments = environments.filter(({ comment }) => comment?.trim());
  const [selectedEnvironmentSlug, setSelectedEnvironmentSlug] = useState(
    commentedEnvironments[0]?.slug ?? environments[0]?.slug ?? ""
  );
  const [isOpen, setIsOpen] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const contentRef = useRef<HTMLDivElement>(null);
  const isEnvironmentSelectOpenRef = useRef(false);

  const selectedEnvironment =
    environments.find(({ slug }) => slug === selectedEnvironmentSlug) ??
    commentedEnvironments[0] ??
    environments[0];

  const cancelOpen = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
  };

  const cancelClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  };

  const handleHoverStart = () => {
    cancelClose();
    cancelOpen();
    openTimerRef.current = setTimeout(() => {
      setIsOpen(true);
    }, 250);
  };

  const handleHoverEnd = () => {
    cancelOpen();
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      if (isEnvironmentSelectOpenRef.current) return;
      if (contentRef.current?.matches(":hover")) return;
      if (contentRef.current?.contains(document.activeElement)) return;
      setIsOpen(false);
    }, 150);
  };

  const openForFocus = () => {
    cancelOpen();
    cancelClose();
    setIsOpen(true);
  };

  useEffect(
    () => () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    []
  );

  if (!commentedEnvironments.length || !selectedEnvironment) return null;

  const environmentLabel = commentedEnvironments.length === 1 ? "environment" : "environments";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-label={`${commentedEnvironments.length} ${environmentLabel} with comments. View or edit comments`}
          className={commentIndicatorClassName}
          onPointerEnter={handleHoverStart}
          onPointerLeave={handleHoverEnd}
          onFocus={openForFocus}
        >
          <MessageSquareIcon />
        </button>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-80"
        onPointerEnter={cancelClose}
        onPointerLeave={handleHoverEnd}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          ref={contentRef}
          onFocusCapture={cancelClose}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              handleHoverEnd();
            }
          }}
        >
          <SecretCommentForm
            key={selectedEnvironment.slug}
            comment={selectedEnvironment.comment}
            secretKey={secretKey}
            secretPath={secretPath}
            environment={selectedEnvironment.slug}
            onClose={() => setIsOpen(false)}
            isReadOnly={selectedEnvironment.isReadOnly}
            autoFocus={false}
            headerContent={
              <Select
                value={selectedEnvironment.slug}
                onValueChange={setSelectedEnvironmentSlug}
                onOpenChange={(open) => {
                  isEnvironmentSelectOpenRef.current = open;
                  if (open) cancelClose();
                  else handleHoverEnd();
                }}
              >
                <SelectTrigger size="sm" className="max-w-40" aria-label="Comment environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="end">
                  {environments.map(({ slug, name }) => (
                    <SelectItem key={slug} value={slug}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const SecretCommentControl = ({
  comment,
  secretKey,
  environment,
  secretPath,
  isBatchMode,
  onCommentChange,
  isReadOnly = false,
  isUnavailable = false
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [shouldAutoFocus, setShouldAutoFocus] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const contentRef = useRef<HTMLDivElement>(null);
  const hasComment = Boolean(comment?.trim());

  const cancelOpen = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
  };

  const cancelClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  };

  const handleHoverStart = () => {
    cancelClose();
    cancelOpen();
    openTimerRef.current = setTimeout(() => {
      setShouldAutoFocus(false);
      setIsOpen(true);
    }, 250);
  };

  const handleHoverEnd = () => {
    cancelOpen();
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      if (contentRef.current?.contains(document.activeElement)) return;
      setIsOpen(false);
    }, 150);
  };

  const openForFocus = () => {
    cancelOpen();
    cancelClose();
    setShouldAutoFocus(false);
    setIsOpen(true);
  };

  useEffect(
    () => () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    []
  );

  if (isUnavailable || (!hasComment && isReadOnly)) return null;

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open && !hasComment) setShouldAutoFocus(true);
      }}
    >
      {hasComment ? (
        <PopoverAnchor asChild>
          <button
            type="button"
            aria-label={isReadOnly ? "View comment" : "View or edit comment"}
            className={commentIndicatorClassName}
            onPointerEnter={handleHoverStart}
            onPointerLeave={handleHoverEnd}
            onFocus={openForFocus}
          >
            <MessageSquareIcon />
          </button>
        </PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>
          <IconButton
            variant="ghost"
            size="xs"
            aria-label="Add comment"
            className="pointer-events-none size-7 border-0 text-muted opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
            <MessageSquarePlusIcon />
          </IconButton>
        </PopoverTrigger>
      )}
      <PopoverContent
        align="start"
        className="w-80"
        onPointerEnter={hasComment ? cancelClose : undefined}
        onPointerLeave={hasComment ? handleHoverEnd : undefined}
        onOpenAutoFocus={(event) => {
          if (!shouldAutoFocus) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          ref={contentRef}
          onFocusCapture={cancelClose}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              handleHoverEnd();
            }
          }}
        >
          <SecretCommentForm
            comment={comment}
            secretKey={secretKey}
            secretPath={secretPath}
            environment={environment}
            onClose={() => setIsOpen(false)}
            isBatchMode={isBatchMode}
            onCommentChange={onCommentChange}
            isReadOnly={isReadOnly}
            autoFocus={shouldAutoFocus}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};
