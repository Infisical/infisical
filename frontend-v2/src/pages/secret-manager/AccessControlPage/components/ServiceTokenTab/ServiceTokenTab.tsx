// import { faWarning } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";

import { ServiceTokenSection } from "./components";

export const ServiceTokenTab = () => {
  return (
    <motion.div
      key="panel-service-token"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <div className="space-y-3">
        {/* <div className="flex w-full flex-row items-center rounded-md border border-primary-600/70 bg-primary/[.07] p-4 text-base text-white">
          <FontAwesomeIcon icon={faWarning} className="pr-6 text-4xl text-white/80" />
          <div className="flex w-full flex-col text-sm">
            <span className="mb-4 text-lg font-semibold">Deprecation Notice</span>
            <p>
              Service Tokens are being deprecated in favor of Machine Identities.
              <br />
              They will be removed in the future in accordance with the deprecation notice and
              timeline stated{" "}
              <a
                href="https://infisical.com/blog/deprecating-api-keys"
                target="_blank"
                className="font-semibold text-primary-400" rel="noreferrer"
              >
                here
              </a>
              .
              <br />
              <a
                href="https://infisical.com/docs/documentation/platform/identities/overview"
                target="_blank"
                className="font-semibold text-primary-400" rel="noreferrer"
              >
                Learn more about Machine Identities
              </a>
            </p>
          </div>
        </div> */}
        <ServiceTokenSection />
      </div>
    </motion.div>
  );
};
