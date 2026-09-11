import { OrgTabGroup } from "./components";

export const SettingsPage = () => {
  return (
    <div className="flex w-full justify-center bg-page text-foreground-inverse">
      <div className="w-full max-w-8xl">
        <OrgTabGroup />
      </div>
    </div>
  );
};
