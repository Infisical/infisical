import { IdentityAuthTemplatesSection, IdentitySection } from "./components";

export const OrgIdentityTab = () => {
  return (
    <div className="flex flex-col gap-4">
      <IdentitySection />
      <IdentityAuthTemplatesSection />
    </div>
  );
};
