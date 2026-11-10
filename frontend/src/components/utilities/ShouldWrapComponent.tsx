import { ComponentType, ReactNode } from "react";

type ShouldWrapProps<T extends object> = {
  children: ReactNode;
  wrapper: ComponentType<T & { children: ReactNode }>;
  isWrapped?: boolean;
} & T;

export const ShouldWrap = <T extends object>({
  children,
  wrapper: Wrapper,
  isWrapped = false,
  ...wrapperProps
}: ShouldWrapProps<T>) => {
  if (isWrapped) {
    return <Wrapper {...(wrapperProps as unknown as T)}>{children}</Wrapper>;
  }

  return children;
};
