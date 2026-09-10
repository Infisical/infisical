const rawLayer = /(?:^|[\s:!])(-?z-)(?:\[(-?\d+)\]|(-?\d+))(?=!|\s|$)/g;
const overlayContent = /(?:Dialog|Modal|Drawer|Sheet|Select|Dropdown(?:Menu|SubMenu)?|Popover|HoverCard|Tooltip|Combobox)(?:Primitive)?\.(?:Content|SubContent|Positioner|Overlay)$|^(?:Dialog|AlertDialog|Modal|Drawer|Sheet|Select|DropdownMenu|DropdownSubMenu|Popover|HoverCard|Tooltip)(?:Content|Overlay|SubContent)$/;

function jsxName(node) {
  if (node.type === "JSXIdentifier") return node.name;
  if (node.type === "JSXMemberExpression") return `${jsxName(node.object)}.${jsxName(node.property)}`;
  return "";
}

function isOverlayAttribute(node) {
  let current = node.parent;
  while (current && current.type !== "JSXAttribute" && current.type !== "Program") current = current.parent;
  return current?.type === "JSXAttribute" && overlayContent.test(jsxName(current.parent.name));
}

export default {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      semantic: "Use the shared semantic layer contract. Overlay consumers must not override numeric z-index values; component-local stacking may remain local."
    }
  },
  create(context) {
    function inspectText(node, value) {
      const matches = [...value.matchAll(rawLayer)];
      if (matches.some((match) => Math.abs(Number(match[2] ?? match[3])) > 50) ||
          (matches.length > 0 && isOverlayAttribute(node))) {
        context.report({ node, messageId: "semantic" });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") inspectText(node, node.value);
      },
      TemplateElement(node) {
        inspectText(node, node.value.raw);
      },
      Property(node) {
        if ((node.key.name ?? node.key.value) !== "zIndex") return;
        if (typeof node.value.value !== "number") return;
        let parent = node.parent;
        while (parent && parent.type !== "Program" &&
          !(parent.type === "Property" && (parent.key.name ?? parent.key.value) === "menuPortal")) {
          parent = parent.parent;
        }
        if (Math.abs(node.value.value) > 50 || isOverlayAttribute(node) || parent?.type === "Property") {
          context.report({ node, messageId: "semantic" });
        }
      }
    };
  }
};
