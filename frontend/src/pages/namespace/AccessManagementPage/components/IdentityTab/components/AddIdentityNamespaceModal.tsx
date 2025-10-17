import { useState } from "react";
import { faLink, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";

import { LinkOrgIdentityForm } from "./LinkOrgIdentityForm";
import { NamespaceIdentityForm } from "./NamespaceIdentityForm";

type Props = {
  handlePopUpToggle: () => void;
};

export const AddIdentityNamespaceModal = ({ handlePopUpToggle }: Props) => {
  const [step, setStep] = useState(0);

  return (
    <div>
      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div
            key="panel-1"
            transition={{ duration: 0.15 }}
            initial={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
            className="flex flex-col gap-4"
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setStep(1)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setStep(1);
                }
              }}
              className="cursor-pointer rounded-md border border-mineshaft-600 p-4 transition-all hover:bg-mineshaft-600"
            >
              <div className="mb-2 flex items-center gap-2">
                <FontAwesomeIcon icon={faPlus} />
                Create New Identity
              </div>
              <div className="text-sm text-mineshaft-300">
                Create a new machine identity specifically for this namespace. This identity will be
                managed at the namespace-level.
              </div>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setStep(2)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setStep(2);
                }
              }}
              className="hover:bg-namespace-v1-600 cursor-pointer rounded-md border border-mineshaft-600 p-4 transition-all"
            >
              <div className="mb-2 flex items-center gap-2">
                <FontAwesomeIcon icon={faLink} />
                Assign Existing Identity
              </div>
              <div className="text-sm text-mineshaft-300">
                Assign an existing identity from your organization to this namespace. The identity
                will continue to be managed at its original scope.
              </div>
            </div>
          </motion.div>
        )}
        {step !== 0 && (
          <motion.div
            key="panel-2"
            transition={{ duration: 0.15 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
          >
            {step === 1 && <NamespaceIdentityForm handlePopUpToggle={handlePopUpToggle} />}
            {step === 2 && <LinkOrgIdentityForm handlePopUpToggle={handlePopUpToggle} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
