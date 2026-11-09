import * as React from "react";

import { Kbd } from "./kbd";

import menu from "./menu.module.css";

export const menuRowContent = (children: React.ReactNode, description?: React.ReactNode) => {
  if (description === undefined && React.isValidElement(children)) return children;
  return React.Children.map(children, (child) => {
    if (typeof child !== "string" && typeof child !== "number") return child;
    if (description === undefined) return <span className={menu.title}>{child}</span>;
    return (
      <span className={menu.text}>
        <span className={menu.title}>{child}</span>
        <span className={menu.description}>{description}</span>
      </span>
    );
  });
};

export const menuShortcutContent = (children: React.ReactNode) =>
  typeof children === "string" ? <Kbd size="sm">{children}</Kbd> : children;
