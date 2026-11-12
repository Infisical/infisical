import * as React from "react";

import { Kbd } from "./kbd";

import menu from "./menu.module.css";

const withDescription = (label: React.ReactNode, description: React.ReactNode) => (
  <span className={menu.text}>
    <span className={menu.title}>{label}</span>
    <span className={menu.description}>{description}</span>
  </span>
);

export const menuRowContent = (children: React.ReactNode, description?: React.ReactNode) => {
  if (description === undefined && React.isValidElement(children)) return children;
  const items = React.Children.toArray(children);
  const textual = (child: React.ReactNode) =>
    typeof child === "string" || typeof child === "number";
  const labelIndex = description === undefined || items.some(textual) ? -1 : items.length - 1;
  return items.map((child, index) => {
    if (index !== labelIndex && !textual(child)) return child;
    const content =
      index !== labelIndex && description === undefined ? (
        <span className={menu.title}>{child}</span>
      ) : (
        withDescription(child, description)
      );
    return <React.Fragment key={index}>{content}</React.Fragment>;
  });
};

export const menuShortcutContent = (children: React.ReactNode) =>
  typeof children === "string" ? <Kbd size="sm">{children}</Kbd> : children;
