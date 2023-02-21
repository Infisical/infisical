interface Props {
  protectedKey?: string;
  protectedKeyIV?: string;
  protectedKeyTag?: string;
  publicKey?: string;
  encryptedPrivateKey?: string;
  iv?: string;
  tag?: string;
  privateKey?: string;
}

export const saveTokenToLocalStorage = ({
  protectedKey,
  protectedKeyIV,
  protectedKeyTag,
  publicKey,
  encryptedPrivateKey,
  iv,
  tag,
  privateKey,
}: Props) => {
  try {
    
    if (protectedKey) {
      localStorage.removeItem("protectedKey");
      localStorage.setItem("protectedKey", protectedKey);
    }

    if (protectedKeyIV) {
      localStorage.removeItem("protectedKeyIV");
      localStorage.setItem("protectedKeyIV", protectedKeyIV);
    }

    if (protectedKeyTag) {
      localStorage.removeItem("protectedKeyTag");
      localStorage.setItem("protectedKeyTag", protectedKeyTag);
    }

    if (publicKey) {
      localStorage.removeItem("publicKey");
      localStorage.setItem("publicKey", publicKey);
    }

    if (encryptedPrivateKey) {
      localStorage.removeItem("encryptedPrivateKey");
      localStorage.setItem("encryptedPrivateKey", encryptedPrivateKey);
    }

    if (iv) {
      localStorage.removeItem("iv");
      localStorage.setItem("iv", iv);
    }

    if (tag) {
      localStorage.removeItem("tag");
      localStorage.setItem("tag", tag);
    }

    if (privateKey) {
      localStorage.removeItem("PRIVATE_KEY");
      localStorage.setItem("PRIVATE_KEY", privateKey);
    }
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(
        `Unable to send the tokens in local storage:${  err.message}`
      );
    }
  }
};
