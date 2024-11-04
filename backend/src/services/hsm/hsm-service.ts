import grapheneLib from "graphene-pk11";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { HsmModule, RequiredMechanisms } from "./hsm-types";

type THsmServiceFactoryDep = {
  hsmModule: HsmModule;
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
export const hsmServiceFactory = ({ hsmModule: { module, graphene } }: THsmServiceFactoryDep) => {
  const appCfg = getConfig();

  // Constants for buffer structure
  const IV_LENGTH = 16;
  const TAG_LENGTH = 16;

  let sessionManager: HsmSessionManager | null = null;

  const $findMasterKey = (session: grapheneLib.Session) => {
    // Find the master key (root key)
    const template = {
      class: graphene.ObjectClass.SECRET_KEY,
      keyType: graphene.KeyType.AES,
      label: appCfg.HSM_KEY_LABEL
    } as grapheneLib.ITemplate;

    const key = session.find(template).items(0);

    if (!key) {
      throw new Error("Failed to find master key");
    }

    return key;
  };

  const $generateAndWrapKey = (session: grapheneLib.Session) => {
    const masterKey = $findMasterKey(session);

    // Generate a new session key for encryption
    const sessionKey = session.generateKey(graphene.KeyGenMechanism.AES, {
      class: graphene.ObjectClass.SECRET_KEY,
      keyType: graphene.KeyType.AES,
      token: false, // Session-only key
      sensitive: true,
      extractable: true, // Must be true to allow wrapping
      encrypt: true,
      decrypt: true,
      valueLen: 32 // 256-bit key
    } as grapheneLib.ITemplate);

    // Wrap the session key with master key
    const wrappingMech = { name: "AES_KEY_WRAP", params: null };
    const wrappedKey = session.wrapKey(
      wrappingMech,
      new graphene.Key(masterKey).toType(),
      new graphene.Key(sessionKey).toType()
    );

    return { wrappedKey, sessionKey };
  };

  const $unwrapKey = (session: grapheneLib.Session, wrappedKey: Buffer) => {
    const masterKey = $findMasterKey(session);

    // Absolute minimal template - let HSM set most attributes
    const unwrapTemplate = {
      class: graphene.ObjectClass.SECRET_KEY,
      keyType: graphene.KeyType.AES
    } as grapheneLib.ITemplate;

    const unwrappingMech = {
      name: "AES_KEY_WRAP",
      params: null
    } as grapheneLib.MechanismType;

    return session.unwrapKey(unwrappingMech, new graphene.Key(masterKey).toType(), wrappedKey, unwrapTemplate);
  };

  const $keyExists = (session: grapheneLib.Session): boolean => {
    try {
      const key = $findMasterKey(session);
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

  const encrypt = (data: Buffer) => {
    if (!module) {
      throw new Error("PKCS#11 module is not initialized");
    }

    if (!sessionManager) {
      throw new Error("HSM Session manager is not initialized");
    }
    const session = sessionManager.getSession();

    // Generate IV for encryption
    const iv = session.generateRandom(IV_LENGTH);

    // Generate and wrap a new session key
    const { wrappedKey, sessionKey } = $generateAndWrapKey(session);

    const alg = {
      name: appCfg.HSM_MECHANISM,
      params: new graphene.AesGcm240Params(iv)
    } as grapheneLib.IAlgorithm;

    const cipher = session.createCipher(alg, new graphene.Key(sessionKey).toType());

    // Calculate the output buffer size based on input length
    // GCM adds a 16-byte auth tag, so we need input length + 16
    const outputBuffer = Buffer.alloc(data.length + TAG_LENGTH);
    const encryptedData = cipher.once(data, outputBuffer);

    // Format: [Wrapped Key (40)][IV (16)][Encrypted Data + Tag]
    return Buffer.concat([wrappedKey, iv, encryptedData]);
  };

  const decrypt = (encryptedBlob: Buffer) => {
    const WRAPPED_KEY_LENGTH = 32 + 8; // AES-256 key + padding

    if (!module || !sessionManager) {
      throw new Error("HSM service not initialized");
    }

    const session = sessionManager.getSession();

    // Extract wrapped key, IV, and ciphertext
    const wrappedKey = encryptedBlob.subarray(0, WRAPPED_KEY_LENGTH);
    const iv = encryptedBlob.subarray(WRAPPED_KEY_LENGTH, WRAPPED_KEY_LENGTH + IV_LENGTH);
    const ciphertext = encryptedBlob.subarray(WRAPPED_KEY_LENGTH + IV_LENGTH);

    // Unwrap the session key
    const sessionKey = $unwrapKey(session, wrappedKey);

    const algo = {
      name: appCfg.HSM_MECHANISM,
      params: new graphene.AesGcm240Params(iv)
    };

    const decipher = session.createDecipher(algo, new graphene.Key(sessionKey).toType());
    const outputBuffer = Buffer.alloc(ciphertext.length);

    return decipher.once(ciphertext, outputBuffer);
  };

  // We test the core functionality of the PKCS#11 module that we are using throughout Infisical. This is to ensure that the user doesn't configure a faulty or unsupported HSM device.
  const $testPkcs11Module = () => {
    try {
      if (!module || !sessionManager) {
        throw new Error("HSM service not initialized");
      }

      const session = sessionManager.getSession();

      let randomData: Buffer;
      let encryptedData: Buffer;
      let decryptedData: Buffer;

      try {
        randomData = session.generateRandom(256);
      } catch (error) {
        throw new Error(`Error generating random bytes: ${(error as Error).message || "Unknown error"}`);
      }

      try {
        encryptedData = encrypt(Buffer.from(randomData));
      } catch (error) {
        throw new Error(`Error encrypting data: ${(error as Error).message || "Unknown error"}`);
      }

      try {
        decryptedData = decrypt(encryptedData);
      } catch (error) {
        throw new Error(`Error decrypting data: ${(error as Error).message || "Unknown error"}`);
      }

      if (Buffer.from(randomData).toString("hex") !== Buffer.from(decryptedData).toString("hex")) {
        throw new Error("Decrypted data does not match original data");
      }
      return true;
    } catch (error) {
      logger.error(error, "Error testing PKCS#11 module");
      return false;
    }
  };

  const isActive = () => {
    if (!module || !appCfg.isHsmConfigured || !sessionManager) {
      return false;
    }

    let pkcs11TestPassed = false;

    try {
      pkcs11TestPassed = $testPkcs11Module();
    } catch (err) {
      logger.error(err, "isActive: Error testing PKCS#11 module");
    }

    return appCfg.isHsmConfigured && module !== null && pkcs11TestPassed;
  };

  const startService = () => {
    if (!appCfg.isHsmConfigured || !module) return;

    sessionManager = new HsmSessionManager(module, graphene);
    const session = sessionManager.getSession();

    try {
      // Check if master key exists, create if not
      if (!$keyExists(session)) {
        // Generate 256-bit AES master key with persistent storage
        session.generateKey(graphene.KeyGenMechanism.AES, {
          class: graphene.ObjectClass.SECRET_KEY,
          token: true,
          valueLen: 256 / 8,
          keyType: graphene.KeyType.AES,
          label: appCfg.HSM_KEY_LABEL,
          derive: true, // Enable key derivation
          extractable: false,
          sensitive: true,
          private: true
        });
        logger.info(`Master key created successfully with label: ${appCfg.HSM_KEY_LABEL}`);
      }

      // Verify HSM supports required mechanisms
      const mechs = session.slot.getMechanisms();
      const mechNames: string[] = [];

      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < mechs.length; i++) {
        mechNames.push(mechs.items(i).name);
      }

      const hasAesGcm = mechNames.includes(RequiredMechanisms.AesGcm);
      const hasAesKeyWrap = mechNames.includes(RequiredMechanisms.AesKeyWrap);

      if (!hasAesGcm) {
        throw new Error(`Required mechanism ${RequiredMechanisms.AesGcm} not supported by HSM`);
      }
      if (!hasAesKeyWrap) {
        throw new Error(`Required mechanism ${RequiredMechanisms.AesKeyWrap} not supported by HSM`);
      }

      // Run a test to verify module is working
      if (!$testPkcs11Module()) {
        throw new Error("PKCS#11 module test failed. Please ensure that the HSM is correctly configured.");
      }
    } catch (error) {
      logger.error(error, "Error initializing HSM service");
      throw error;
    }
  };

  return {
    encrypt,
    startService,
    isActive,
    decrypt
  };
};
