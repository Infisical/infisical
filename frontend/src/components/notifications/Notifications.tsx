import { ReactNode } from "react";
import { Id, toast, ToastContainer, ToastOptions, TypeOptions } from "react-toastify";

export type TNotification = {
  title?: string;
  text: ReactNode;
  children?: ReactNode;
};

export const NotificationContent = ({ title, text, children }: TNotification) => {
  return (
    <div className="msg-container">
      {title && <div className="text-md mb-1 font-medium">{title}</div>}
      <div className={title ? "text-sm text-neutral-400" : "text-md"}>{text}</div>
      {children && <div className="mt-2">{children}</div>}
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
    theme: "dark",
    type: myProps?.type || "info"
  });

export const NotificationContainer = () => (
  <ToastContainer
    pauseOnHover
    toastClassName="border border-mineshaft-500"
    style={{ width: "400px" }}
  />
);
