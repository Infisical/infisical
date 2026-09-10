import { RuleTester } from "eslint";
import rule from "../eslint-rules/semantic-layers.mjs";

const tester = new RuleTester({ parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } } });
tester.run("semantic-layers", rule, {
  valid: [
    '<div className="sticky z-50" />',
    '<DialogContent className="max-w-xl" />',
    '<DialogPrimitive.Content className="z-layer-content" />',
    'const style = { zIndex: 10 };',
    'const styles = { menuPortal: base => ({ ...base, zIndex: "var(--z-index-layer-floating)" }) };',
    '<TableHeader className="z-[1]" />'
  ],
  invalid: [
    { code: '<TooltipContent className="z-[70]" />', errors: [{ messageId: "semantic" }] },
    { code: '<DialogContent className="z-20" />', errors: [{ messageId: "semantic" }] },
    { code: '<DialogPrimitive.Content className="z-50" />', errors: [{ messageId: "semantic" }] },
    { code: '<div className="z-99999999!" />', errors: [{ messageId: "semantic" }] },
    { code: '<div className={`fixed z-[100] ${name}`} />', errors: [{ messageId: "semantic" }] },
    { code: 'const styles = { menuPortal: base => ({ ...base, zIndex: 30 }) };', errors: [{ messageId: "semantic" }] },
    { code: '<PopoverContent style={{ zIndex: 5 }} />', errors: [{ messageId: "semantic" }] }
  ]
});
