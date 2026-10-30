import * as React from "react";

import { Kbd } from "./kbd";

import menu from "./menu.module.css";

export const menuRowContent = (children: React.ReactNode) =>
  React.isValidElement(children)
    ? children
    : React.Children.map(children, (child) =>
        typeof child === "string" || typeof child === "number" ? (
          <span className={menu.title}>{child}</span>
        ) : (
          child
        )
      );

export const menuShortcutContent = (children: React.ReactNode) =>
  typeof children === "string" ? <Kbd size="sm">{children}</Kbd> : children;
