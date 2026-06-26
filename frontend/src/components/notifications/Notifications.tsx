import { ReactNode } from "react";
import { type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";

import { IconButton } from "@app/components/v3/generic/IconButton";
import { Toaster } from "@app/components/v3/generic/Toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3/generic/Tooltip";
import { useTimedReset } from "@app/hooks";

export type NotificationType = "success" | "error" | "info" | "warning" | "loading" | "default";

export type TNotification = {
  title?: string;
  text: ReactNode;
  children?: ReactNode;
  callToAction?: ReactNode;
  copyActions?: { icon?: IconDefinition; value: string; name: string; label?: string }[];
};

// Back-compat shim for the old react-toastify second argument. Only `autoClose` is ever passed
// at call sites; it maps to sonner's `duration`.
type TNotificationOptions = {
  autoClose?: number | false;
  duration?: number;
};

// v3 copy button used inside toast bodies (e.g. the request-id copy on error toasts).
const ToastCopyButton = ({ value, name }: { value: string; name: string }) => {
  const [copyText, isCopying, setCopyText] = useTimedReset<string>({
    initialState: `Copy ${name}`
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          aria-label={copyText}
          variant="ghost-muted"
          size="xs"
          className="size-5"
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard
              .writeText(value)
              .then(() => setCopyText("Copied"))
              .catch(() => {
                // clipboard write failed (e.g. denied permissions); leave the state unchanged
              });
          }}
        >
          {isCopying ? <CheckIcon className="size-3!" /> : <CopyIcon className="size-3!" />}
        </IconButton>
      </TooltipTrigger>
      {/* Render above the sonner toaster (z-index 999999999) so the tooltip isn't occluded. */}
      <TooltipContent className="z-[2147483647]">{copyText}</TooltipContent>
    </Tooltip>
  );
};

// Everything that renders below sonner's headline: the body text (only when a title takes
// the headline), children, the call-to-action and the copy buttons.
const NotificationBody = ({
  text,
  children,
  callToAction,
  copyActions
}: Omit<TNotification, "title">) => (
  <div className="msg-container">
    {text && <div className="whitespace-pre-line">{text}</div>}
    {children && <div className="mt-2">{children}</div>}
    {(callToAction || copyActions) && (
      <div
        className={twMerge(
          "mt-2 flex w-full flex-row items-end gap-2",
          callToAction ? "h-7 justify-between" : "h-5 justify-end"
        )}
      >
        {callToAction}
        {copyActions && (
          <div
            className={twMerge("flex flex-row items-center gap-2", callToAction ? "h-7" : "h-5")}
          >
            {copyActions.map((action) => (
              <div className="flex flex-row items-center gap-1.5" key={`copy-${action.name}`}>
                {action.label && (
                  <span className="ml-2 text-xs text-mineshaft-400">{action.label}</span>
                )}
                <ToastCopyButton value={action.value} name={action.name} />
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
);

const toastByType = {
  success: toast.success,
  error: toast.error,
  info: toast.info,
  warning: toast.warning,
  loading: toast.loading,
  default: toast.message
} satisfies Record<NotificationType, typeof toast.message>;

export const createNotification = (
  {
    title,
    text,
    children,
    callToAction,
    copyActions,
    type = "info"
  }: TNotification & { type?: NotificationType },
  options: TNotificationOptions = {}
) => {
  // When a title is present it becomes sonner's headline and the text drops into the body;
  // otherwise the text itself is the headline.
  const bodyText = title ? text : undefined;
  const hasBody = Boolean(bodyText || children || callToAction || copyActions);

  const duration =
    type === "loading" || options.autoClose === false
      ? Infinity
      : (options.duration ?? options.autoClose ?? (type === "error" ? 8000 : 3000));

  const notify = toastByType[type] ?? toast.message;

  return notify(title || text, {
    description: hasBody ? (
      <NotificationBody text={bodyText} callToAction={callToAction} copyActions={copyActions}>
        {children}
      </NotificationBody>
    ) : undefined,
    duration
  });
};

// Imperatively dismiss a toast by the id returned from `createNotification`. Keeps the
// sonner dependency encapsulated in this module.
export const dismissNotification = (id: string | number) => toast.dismiss(id);

// All styling/position/close-button config lives in the v3 Toaster itself.
export const NotificationContainer = () => <Toaster />;
