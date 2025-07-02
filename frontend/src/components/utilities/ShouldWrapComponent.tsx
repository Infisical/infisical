import { ComponentType, ReactNode } from "react";

type ShouldWrapProps<T extends Record<string, any>> = {
  children: ReactNode;
  wrapper: ComponentType<T & { children: ReactNode }>;
  isWrapped?: boolean;
} & T;

export const ShouldWrap = <T extends Record<string, any>>({
  children,
  wrapper: Wrapper,
  isWrapped = false,
  ...wrapperProps
}: ShouldWrapProps<T>) => {
  if (isWrapped) {
    return <Wrapper {...(wrapperProps as any)}>{children}</Wrapper>;
  }

  return children;
};
