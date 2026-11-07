import * as React from "react";
import {
  ContextMenu as ContextMenuPrimitive,
  DropdownMenu as DropdownMenuPrimitive
} from "radix-ui";

/** Which menu a shared item renders in, so the DropdownMenu items also render inside a ContextMenu. */
export const MenuKindContext = React.createContext<"dropdown" | "context">("dropdown");

/** The Radix primitives for the menu an item sits in. Both share the same Menu parts and props. */
export const useMenuPrimitive = () =>
  (React.useContext(MenuKindContext) === "context"
    ? ContextMenuPrimitive
    : DropdownMenuPrimitive) as typeof DropdownMenuPrimitive;
