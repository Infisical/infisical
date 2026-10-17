import type { IconButtonProps } from "../IconButton";
import type { LoaderVariant } from "../Loader";
import type { ButtonProps } from "./Button";

const buttonLoaderVariants = {
  default: "background",
  outline: "neutral",
  ghost: "neutral",
  "ghost-muted": "neutral",
  link: "neutral",
  text: "neutral",
  neutral: "neutral",
  danger: "neutral",
  project: "project",
  org: "org",
  "sub-org": "sub-org",
  success: "success",
  info: "info",
  warning: "warning",
  pam: "pam",
  av: "av",
  ss: "ss",
  product: "product"
} satisfies Record<NonNullable<ButtonProps["variant"] | IconButtonProps["variant"]>, LoaderVariant>;

export const getButtonLoaderVariant = (
  variant: ButtonProps["variant"] | IconButtonProps["variant"]
) => (variant ? buttonLoaderVariants[variant] : "neutral");
