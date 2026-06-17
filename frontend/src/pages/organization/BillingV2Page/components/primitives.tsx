import {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  MouseEvent,
  ReactNode
} from "react";

import { IconExternal, IconX } from "../icons";

export type ButtonVariant =
  | "outline"
  | "ghost"
  | "neutral"
  | "org"
  | "success"
  | "info"
  | "warning"
  | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  loading?: boolean;
};

export const Button = ({
  variant = "outline",
  size = "md",
  children,
  full,
  loading,
  disabled,
  ...rest
}: ButtonProps) => (
  <button
    type="button"
    className={`btn btn-${variant} ${size} ${full ? "full" : ""}`}
    disabled={loading || disabled}
    {...rest}
  >
    {loading && <span className="spin" style={{ width: 13, height: 13 }} />}
    {children}
  </button>
);

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  title?: string;
};

export const IconButton = ({ children, title, ...rest }: IconButtonProps) => (
  <button type="button" className="icon-btn" title={title} {...rest}>
    {children}
  </button>
);

export type BadgeVariant =
  | "neutral"
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "org"
  | "outline";

type BadgeProps = {
  variant?: BadgeVariant;
  dot?: boolean;
  children?: ReactNode;
};

export const Badge = ({ variant = "neutral", dot, children }: BadgeProps) => (
  <span className={`badge badge-${variant}`}>
    {dot && <span className="dot" />}
    {children}
  </span>
);

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = (p: InputProps) => <input className="input" {...p} />;

type FieldProps = {
  label?: ReactNode;
  desc?: ReactNode;
  children?: ReactNode;
};

export const Field = ({ label, desc, children }: FieldProps) => (
  <div>
    {label && (
      // eslint-disable-next-line jsx-a11y/label-has-associated-control
      <label className="field-label">{label}</label>
    )}
    {children}
    {desc && <div className="field-desc">{desc}</div>}
  </div>
);

type CardProps = {
  title?: ReactNode;
  desc?: ReactNode;
  action?: ReactNode;
  docs?: boolean;
  noPad?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
};

export const Card = ({ title, desc, action, docs, noPad, children, style }: CardProps) => {
  let headerStyle: CSSProperties | undefined;
  if (noPad) {
    headerStyle = { padding: "18px 20px 0" };
  }
  return (
    <div className={`card ${noPad ? "no-pad" : ""}`} style={style}>
      {(title || action) && (
        <div className="card-header" style={headerStyle}>
          <div>
            <div className="card-title">
              {title}
              {docs && (
                <a className="badge badge-info" style={{ cursor: "pointer" }}>
                  Documentation <IconExternal size={11} stroke={2.25} />
                </a>
              )}
            </div>
            {desc && <div className="card-desc">{desc}</div>}
          </div>
          {action && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              {action}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
};

type SkeletonProps = {
  w?: number | string;
  h?: number | string;
  r?: number | string;
  style?: CSSProperties;
};

export const Skeleton = ({ w = "100%", h = 14, r, style }: SkeletonProps) => (
  <div className="sk" style={{ width: w, height: h, borderRadius: r, ...style }} />
);

type ModalProps = {
  title?: ReactNode;
  desc?: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
  closable?: boolean;
};

// Modal — centered dialog. onClose fires on backdrop click + close button.
export const Modal = ({
  title,
  desc,
  onClose,
  wide,
  children,
  footer,
  closable = true
}: ModalProps) => {
  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && closable) {
      onClose?.();
    }
  };
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true">
        {(title || closable) && (
          <div className="modal-head">
            <div>
              {title && <div className="m-title">{title}</div>}
              {desc && <div className="m-desc">{desc}</div>}
            </div>
            {closable && (
              <button
                type="button"
                className="icon-btn"
                onClick={onClose}
                aria-label="Close"
                style={{ marginTop: -2, marginRight: -6 }}
              >
                <IconX size={16} />
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
};

type SpinnerProps = {
  lg?: boolean;
  org?: boolean;
};

export const Spinner = ({ lg, org }: SpinnerProps) => (
  <span className={`spin ${lg ? "lg" : ""} ${org ? "org" : ""}`} />
);
