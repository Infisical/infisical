import { PropsWithChildren, useEffect, useState } from "react";
import { DocsContainer, DocsContainerProps } from "@storybook/addon-docs/blocks";
import { GLOBALS_UPDATED } from "storybook/internal/core-events";
import { GlobalsUpdatedPayload } from "storybook/internal/types";
import { themes } from "storybook/theming";

import { useTheme } from "../src/components/v3/platform/ThemeProvider";
import { ThemePreview } from "./decorators/DocumentDecorator";

const ThemedDocs = ({ children, context }: PropsWithChildren<DocsContainerProps>) => {
  const { resolvedTheme } = useTheme();

  return (
    <DocsContainer context={context} theme={themes[resolvedTheme]}>
      {children}
    </DocsContainer>
  );
};

export const ThemeDocsContainer = ({
  children,
  context
}: PropsWithChildren<DocsContainerProps>) => {
  const [globals, setGlobals] = useState(
    () => context.getStoryContext(context.storyById()).globals
  );

  useEffect(() => {
    const onGlobalsUpdated = (event: GlobalsUpdatedPayload) => setGlobals(event.globals);
    context.channel.on(GLOBALS_UPDATED, onGlobalsUpdated);
    return () => context.channel.off(GLOBALS_UPDATED, onGlobalsUpdated);
  }, [context.channel]);

  return (
    <ThemePreview theme={globals.theme} productAccent={globals.productAccent}>
      <ThemedDocs context={context}>{children}</ThemedDocs>
    </ThemePreview>
  );
};
