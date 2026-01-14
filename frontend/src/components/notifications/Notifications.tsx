import { ReactNode } from "react";
import { Id, toast, ToastContainer, ToastOptions, TypeOptions } from "react-toastify";
import { faCopy, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { twMerge } from "tailwind-merge";

import { CopyButton } from "../v2/CopyButton";

export type TNotification = {
  title?: string;
  text: ReactNode;
  children?: ReactNode;
  callToAction?: ReactNode;
  copyActions?: { icon?: IconDefinition; value: string; name: string; label?: string }[];
};

export const NotificationContent = ({
  title,
  text,
  children,
  callToAction,
  copyActions
}: TNotification) => {
  return (
    <div className="msg-container">
      {title && <div className="text-md mb-1 font-medium">{title}</div>}
      <div className={title ? "text-sm text-neutral-400" : "text-md"}>{text}</div>
      {children && <div className="mt-2">{children}</div>}
      {(callToAction || copyActions) && (
        <div
          className={twMerge(
            "mt-2 flex h-7 w-full flex-row items-end gap-2",
            callToAction ? "justify-between" : "justify-end"
          )}
        >
          {callToAction}
          {copyActions && (
            <div className="flex h-7 flex-row items-center gap-2">
              {copyActions.map((action) => (
                <div className="flex flex-row items-center gap-2" key={`copy-${action.name}`}>
                  {action.label && (
                    <span className="ml-2 text-xs text-mineshaft-400">{action.label}</span>
                  )}
                  <CopyButton
                    value={action.value}
                    name={action.name}
                    size="xs"
                    variant="plain"
                    color="text-mineshaft-400"
                    icon={action.icon ?? faCopy}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const createNotification = (
  myProps: TNotification & { type?: TypeOptions },
  toastProps: ToastOptions = {}
): Id =>
  toast(<NotificationContent {...myProps} />, {
    position: "bottom-right",
    ...toastProps,
    autoClose: toastProps.autoClose || (myProps?.type === "error" ? 8000 : 5000),
    theme: "dark",
    type: myProps?.type || "info",
    className: `pointer-events-auto ${toastProps.className}`
  });

export const NotificationContainer = () => (
  <ToastContainer
    pauseOnHover
    toastClassName="border border-mineshaft-500"
    style={{ width: "400px" }}
  />
);
