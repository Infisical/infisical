import { Input, TextArea } from "@app/components/v2";

export const GlobTestSection = () => {
  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex flex-col gap-4 w-full max-w-7xl">
        <p className="text-xl font-semibold text-mineshaft-100">Glob Tool</p>

        <div className="flex gap-4">
          <p>Examples:</p>

          <div>
            <span>Zero or More Chars * One Char '?' Recursive (globstar) ** </span>
            <span>List {'{'}a,b,c{'}'} Range [abc] Not in Range [!abc] Not Patterns !(a|b) Zero or One Pattern ?(a|b)</span>
            <span> Zero or More Patterns *(a|b) One or More Patterns +(a|b) Exactly One Pattern @(a|b)</span>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <Input />
          <div className="flex flex-col gap-3">
            <p>Test String</p>
            <TextArea />
          </div>
        </div>
      </div>
    </div>
  );
};
