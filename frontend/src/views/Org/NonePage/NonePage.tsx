import { useEffect } from "react";

import { usePopUp } from "@app/hooks/usePopUp";

import { CreateOrgModal } from "../components";

export const NonePage = () => {
  const { popUp, handlePopUpToggle } = usePopUp(["createOrg"] as const);

  useEffect(() => {
    handlePopUpToggle("createOrg", true);
  }, []);

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <CreateOrgModal
        isOpen={popUp.createOrg.isOpen}
        onClose={() => handlePopUpToggle("createOrg", false)}
      />
    </div>
  );
};
