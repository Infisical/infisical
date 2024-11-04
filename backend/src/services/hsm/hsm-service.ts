import grapheneLib from "graphene-pk11";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { HsmModule, RequiredMechanisms } from "./hsm-types";

type THsmServiceFactoryDep = {
  hsmModule: HsmModule;
};

const USER_ALREADY_LOGGED_IN_ERROR = "CKR_USER_ALREADY_LOGGED_IN";
const WRAPPED_KEY_LENGTH = 32 + 8; // AES-256 key + padding

export type THsmServiceFactory = ReturnType<typeof hsmServiceFactory>;

type SyncOrAsync<T> = T | Promise<T>;
type SessionCallback<T> = (session: grapheneLib.Session) => SyncOrAsync<T>;

export const withSession = async <T>(
  { module, graphene }: HsmModule,
  callbackWithSession: SessionCallback<T>
): Promise<T> => {
  const appCfg = getConfig();

  let session: grapheneLib.Session | null = null;
  try {
    if (!module) {
      throw new Error("PKCS#11 module is not initialized");
    }

    // Create new session
    const slot = module.getSlots(appCfg.HSM_SLOT);
    // eslint-disable-next-line no-bitwise
    if (!(slot.flags & graphene.SlotFlag.TOKEN_PRESENT)) {
      throw new Error("Slot is not initialized");
    }

    for (let i = 0; i < 10; i += 1) {
      try {
        // eslint-disable-next-line no-bitwise
        session = slot.open(graphene.SessionFlag.RW_SESSION | graphene.SessionFlag.SERIAL_SESSION);
        session.login(appCfg.HSM_PIN!);
      } catch (error) {
        if ((error as Error)?.message !== USER_ALREADY_LOGGED_IN_ERROR) {
          throw error;
        }
        logger.warn("HSM session already logged in");
        session = null;
      }

      if (session) {
        break;
      }

      logger.warn("Waiting for session to be available...");
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        let sleepAmount = 1_500 * (i + 1);
        if (sleepAmount > 5000) sleepAmount = 5000;

        setTimeout(resolve, sleepAmount);
      });
    }

    if (!session) {
      throw new Error("Failed to open session");
    }

    // Execute the callback and await its result (works for both sync and async)
    const result = await callbackWithSession(session);
    return result;
  } finally {
    // Clean up session if it was created
    if (session) {
      try {
        session.logout();
        session.close();
      } catch (error) {
        logger.error("Error cleaning up HSM session:", error);
      }
    }
  }
};

// eslint-disable-next-line no-empty-pattern
export const hsmServiceFactory = ({ hsmModule: { module, graphene } }: THsmServiceFactoryDep) => {
  const appCfg = getConfig();

  // Constants for buffer structure
  const IV_LENGTH = 16;
  const TAG_LENGTH = 16;

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

  const encrypt: {
    (data: Buffer, providedSession: grapheneLib.Session): Promise<Buffer>;
    (data: Buffer): Promise<Buffer>;
  } = async (data: Buffer, providedSession?: grapheneLib.Session) => {
    if (!module) {
      throw new Error("PKCS#11 module is not initialized");
    }

    const $performEncryption = (s: grapheneLib.Session) => {
      // Generate IV for encryption
      const iv = s.generateRandom(IV_LENGTH);

      // Generate and wrap a new session key
      const { wrappedKey, sessionKey } = $generateAndWrapKey(s);

      const alg = {
        name: appCfg.HSM_MECHANISM,
        params: new graphene.AesGcm240Params(iv)
      } as grapheneLib.IAlgorithm;

      const cipher = s.createCipher(alg, new graphene.Key(sessionKey).toType());

      // Calculate the output buffer size based on input length
      // GCM adds a 16-byte auth tag, so we need input length + 16
      const outputBuffer = Buffer.alloc(data.length + TAG_LENGTH);
      const encryptedData = cipher.once(data, outputBuffer);

      // Format: [Wrapped Key (40)][IV (16)][Encrypted Data + Tag]
      return Buffer.concat([wrappedKey, iv, encryptedData]);
    };

    if (providedSession) {
      return $performEncryption(providedSession);
    }

    const encrypted = await withSession({ module, graphene }, $performEncryption);

    return encrypted;
  };

  const decrypt: {
    (encryptedBlob: Buffer, providedSession: grapheneLib.Session): Promise<Buffer>;
    (encryptedBlob: Buffer): Promise<Buffer>;
  } = async (encryptedBlob: Buffer, providedSession?: grapheneLib.Session) => {
    if (!module) {
      throw new Error("HSM service not initialized");
    }

    const $performDecryption = (s: grapheneLib.Session) => {
      const wrappedKey = encryptedBlob.subarray(0, WRAPPED_KEY_LENGTH);
      const iv = encryptedBlob.subarray(WRAPPED_KEY_LENGTH, WRAPPED_KEY_LENGTH + IV_LENGTH);
      const ciphertext = encryptedBlob.subarray(WRAPPED_KEY_LENGTH + IV_LENGTH);

      // Unwrap the session key
      const sessionKey = $unwrapKey(s, wrappedKey);

      const algo = {
        name: appCfg.HSM_MECHANISM,
        params: new graphene.AesGcm240Params(iv)
      };

      const decipher = s.createDecipher(algo, new graphene.Key(sessionKey).toType());
      const outputBuffer = Buffer.alloc(ciphertext.length);

      // Extract wrapped key, IV, and ciphertext
      return decipher.once(ciphertext, outputBuffer);
    };

    if (providedSession) {
      return $performDecryption(providedSession);
    }
    const decrypted = await withSession({ module, graphene }, (newSession) => $performDecryption(newSession));

    return decrypted;
  };

  // We test the core functionality of the PKCS#11 module that we are using throughout Infisical. This is to ensure that the user doesn't configure a faulty or unsupported HSM device.
  const $testPkcs11Module = async (session: grapheneLib.Session) => {
    try {
      if (!module) {
        throw new Error("HSM service not initialized");
      }

      if (!session) {
        throw new Error("Session not initialized");
      }

      const randomData = session.generateRandom(256);
      const encryptedData = await encrypt(Buffer.from(randomData), session);
      const decryptedData = await decrypt(encryptedData, session);

      if (Buffer.from(randomData).toString("hex") !== Buffer.from(decryptedData).toString("hex")) {
        throw new Error("Decrypted data does not match original data");
      }

      return true;
    } catch (error) {
      logger.error(error, "Error testing PKCS#11 module");
      return false;
    }
  };

  const isActive = async () => {
    if (!module || !appCfg.isHsmConfigured) {
      return false;
    }

    let pkcs11TestPassed = false;

    try {
      pkcs11TestPassed = await withSession({ module, graphene }, $testPkcs11Module);
    } catch (err) {
      logger.error(err, "isActive: Error testing PKCS#11 module");
    }

    return appCfg.isHsmConfigured && module !== null && pkcs11TestPassed;
  };

  const startService = async () => {
    if (!appCfg.isHsmConfigured || !module) return;

    try {
      await withSession({ module, graphene }, async (session) => {
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

        const testPassed = await $testPkcs11Module(session);

        // Run a test to verify module is working
        if (!testPassed) {
          throw new Error("PKCS#11 module test failed. Please ensure that the HSM is correctly configured.");
        }
      });
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
