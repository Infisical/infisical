import * as React from "react";

import { useDescendantFlags } from "../lib/descendant-flags";

import menu from "./menu.module.css";

const leadIcon = `:is(svg, [data-menu-icon]):not(.${menu.trail})`;
const insetFlags = {
  "data-icon-slot": `.${menu.row} > ${leadIcon}, .${menu.row}[data-inset], .${menu.label}[data-inset]`
};
const insetWatch = {
  attributes: ["data-inset"],
  marks: { "data-lead-icon": `.${menu.row}:has(> ${leadIcon})` }
};

/** The ref for a menu inset: it reserves the lead icon column once any row has an icon or is inset, and marks the rows that bring their own icon. */
export const useMenuInset = <T extends Element>(ref?: React.Ref<T>) =>
  useDescendantFlags<T>(insetFlags, insetWatch, ref);
