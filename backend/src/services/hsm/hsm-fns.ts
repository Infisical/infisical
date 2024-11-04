import * as grapheneLib from "graphene-pk11";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { HsmModule } from "./hsm-types";

export const initializeHsmModule = () => {
  const appCfg = getConfig();

  let module: grapheneLib.Module | null = null;

  const initialize = () => {
    if (!appCfg.isHsmConfigured) {
      return;
    }

    module = grapheneLib.Module.load(appCfg.HSM_LIB_PATH!, "SoftHSM");
    module.initialize();
    logger.info("PKCS#11 module initialized");
  };

  const finalize = () => {
    if (module) {
      module.finalize();
      logger.info("PKCS#11 module finalized");
    }
  };

  const getModule = (): HsmModule => ({ module, graphene: grapheneLib });

  return {
    initialize,
    finalize,
    getModule
  };
};
