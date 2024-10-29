import grapheneLib from "graphene-pk11";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { HsmModule } from "./hsm-fns";

type THsmServiceFactoryDep = {
  pkcs11Module: HsmModule;
};
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const USER_ALREADY_LOGGED_IN_ERROR = "CKR_USER_ALREADY_LOGGED_IN";

export type THsmServiceFactory = ReturnType<typeof hsmServiceFactory>;

class HsmSessionManager {
  private session: grapheneLib.Session | null = null;

  private lastUsed: number = 0;

  private module: grapheneLib.Module;

  private graphene: typeof grapheneLib;

  private sessionCheckInterval: NodeJS.Timeout | null = null;

  private startSessionMonitoring() {
    // Check session health every minute
    this.sessionCheckInterval = setInterval(() => {
      this.checkAndRefreshSession();
    }, 60 * 1000); // 1 minute
  }

  private checkAndRefreshSession() {
    if (!this.session) return;

    const now = Date.now();
    if (now - this.lastUsed > SESSION_TIMEOUT) {
      logger.info("Session expired, cleaning up...");
      this.cleanup();
    }
  }

  private cleanup() {
    if (this.session) {
      try {
        this.session.logout();
        this.session.close();
      } catch (error) {
        logger.error("Error during session cleanup:", error);
      }
      this.session = null;
    }

    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
  }

  getSession(): grapheneLib.Session {
    const appCfg = getConfig();

    // If we have a valid session, update its last used time and return it
    if (this.session) {
      try {
        // Try a simple operation to verify session is still valid
        this.session.generateRandom(16);
        this.lastUsed = Date.now();
        return this.session;
      } catch (error) {
        logger.info("HSM Session validation failed, creating new session...");
        this.cleanup();
      }
    }

    // Create new session
    const slot = this.module.getSlots(appCfg.HSM_SLOT);
    // eslint-disable-next-line no-bitwise
    if (!(slot.flags & this.graphene.SlotFlag.TOKEN_PRESENT)) {
      throw new Error("Slot is not initialized");
    }

    // eslint-disable-next-line no-bitwise
    const session = slot.open(this.graphene.SessionFlag.RW_SESSION | this.graphene.SessionFlag.SERIAL_SESSION);

    try {
      session.login(appCfg.HSM_PIN!);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- The error is of type `Pkcs11Error`, but this error is not exported by graphene. And we don't want to install another library just for an error assertion.
      if (error.message !== USER_ALREADY_LOGGED_IN_ERROR) {
        throw error;
      }
    }

    this.session = session;
    this.lastUsed = Date.now();

    return session;
  }

  constructor(module: grapheneLib.Module, graphene: typeof grapheneLib) {
    this.module = module;
    this.graphene = graphene;

    this.startSessionMonitoring();
  }
}

// eslint-disable-next-line no-empty-pattern
export const hsmServiceFactory = ({ pkcs11Module: { module, graphene } }: THsmServiceFactoryDep) => {
  const appCfg = getConfig();

  // Constants for buffer structure
  const IV_LENGTH = 16;
  const TAG_LENGTH = 16;

  let sessionManager: HsmSessionManager | null = null;

  const $findKey = (session: grapheneLib.Session) => {
    // Find the existing AES key
    const template = {
      class: graphene.ObjectClass.SECRET_KEY,
      keyType: graphene.KeyType.AES,
      label: appCfg.HSM_KEY_LABEL
    } as grapheneLib.ITemplate;

    const key = session.find(template).items(0);

    if (!key) {
      throw new Error("Failed to encrypt data, AES key not found");
    }

    return key;
  };

  const $keyExists = (session: grapheneLib.Session): boolean => {
    try {
      const key = $findKey(session);
      // items(0) will throw an error if no items are found
      // Return true only if we got a valid object with handle
      return key && typeof key.handle !== "undefined";
    } catch (error) {
      // If items(0) throws, it means no key was found
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
      if ((error as any).message?.includes("CKR_OBJECT_HANDLE_INVALID")) {
        return false;
      }
      logger.error(error, "Error checking for HSM key presence");
      return false;
    }
  };

  const isActive = () => {
    if (!module || !appCfg.isHsmConfigured || !sessionManager) {
      return false;
    }

    return appCfg.isHsmConfigured && module !== null;
  };

  const startService = () => {
    if (!appCfg.isHsmConfigured || !module) return;

    sessionManager = new HsmSessionManager(module, graphene);
    const session = sessionManager.getSession();

    try {
      // Check if key already exists
      if ($keyExists(session)) {
        logger.info("Key already exists, skipping creation");
      } else {
        // Generate 256-bit AES key with persistent storage
        session.generateKey(graphene.KeyGenMechanism.AES, {
          class: graphene.ObjectClass.SECRET_KEY,
          token: true, // This ensures the key is stored persistently
          valueLen: 256 / 8,
          keyType: graphene.KeyType.AES,
          label: appCfg.HSM_KEY_LABEL,
          encrypt: true,
          decrypt: true,
          extractable: false, // Prevent key export
          sensitive: true, // Mark as sensitive data
          private: true // Require login to access
        });
        logger.info(`Key created successfully with label: ${appCfg.HSM_KEY_LABEL}`);
      }

      const mechs = session.slot.getMechanisms();
      let gotAesGcmMechanism = false;

      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < mechs.length; i++) {
        const mech = mechs.items(i);
        if (mech.name === "AES_GCM") {
          gotAesGcmMechanism = true;
          break;
        }
      }

      if (!gotAesGcmMechanism) {
        throw new Error("Failed to initialize HSM. AES GCM encryption mechanism not supported by the HSM");
      }
    } catch (error) {
      logger.error(error, "Error creating HSM key");
      throw error;
    }
  };

  function encrypt(data: Buffer): Buffer {
    if (!module) {
      throw new Error("PKCS#11 module is not initialized");
    }

    if (!sessionManager) {
      throw new Error("HSM Session manager is not initialized");
    }
    const session = sessionManager.getSession();
    const key = $findKey(session);

    // Generate IV
    const iv = session.generateRandom(IV_LENGTH);
    const alg = {
      name: appCfg.HSM_MECHANISM,
      params: new graphene.AesGcm240Params(iv)
    } as grapheneLib.IAlgorithm;

    const cipher = session.createCipher(alg, new graphene.Key(key).toType());

    // Calculate the output buffer size based on input length
    // GCM adds a 16-byte auth tag, so we need input length + 16
    const outputBuffer = Buffer.alloc(data.length + TAG_LENGTH);
    const encryptedData = cipher.once(data, outputBuffer);

    // Combine IV + encrypted data into a single buffer
    // Format: [IV (16 bytes)][Encrypted Data][Auth Tag (16 bytes)]
    return Buffer.concat([iv, encryptedData]);
  }

  function decrypt(encryptedBlob: Buffer): Buffer {
    if (!module) {
      throw new Error("PKCS#11 module is not initialized");
    }

    if (!sessionManager) {
      throw new Error("HSM Session manager is not initialized");
    }

    const session = sessionManager.getSession();
    const key = $findKey(session);

    // Extract IV, ciphertext, and tag from the blob
    const iv = encryptedBlob.subarray(0, IV_LENGTH);
    const ciphertext = encryptedBlob.subarray(IV_LENGTH, encryptedBlob.length);

    const algo = {
      name: appCfg.HSM_MECHANISM,
      params: new graphene.AesGcm240Params(iv) // Pass both IV and tag
    };

    const decipher = session.createDecipher(algo, new graphene.Key(key).toType());

    // Allocate buffer for decrypted data
    const outputBuffer = Buffer.alloc(ciphertext.length);

    const decrypted = decipher.once(ciphertext, outputBuffer);
    return decrypted;
  }
  return {
    encrypt,
    startService,
    isActive,
    decrypt
  };
};
