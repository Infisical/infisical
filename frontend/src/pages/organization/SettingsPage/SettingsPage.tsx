import { OrgTabGroup } from "./components";

export const SettingsPage = () => {
  return (
    <div className="flex w-full justify-center bg-bunker-800 text-foreground">
      <div className="w-full max-w-8xl">
        <OrgTabGroup />
      </div>
    </div>
  );
};
