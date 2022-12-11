import publicKeyInfical from '~/pages/api/auth/publicKeyInfisical';
import changeHerokuConfigVars from '~/pages/api/integrations/ChangeHerokuConfigVars';

const crypto = require('crypto');
const {
  encryptSymmetric,
  encryptAssymmetric
} = require('../cryptography/crypto');
const nacl = require('tweetnacl');
nacl.util = require('tweetnacl-util');

interface Props {
  obj: Record<string, string>;
  integrationId: string;
}

const pushKeysIntegration = async ({ obj, integrationId }: Props) => {
  const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY');

  const randomBytes = crypto.randomBytes(16).toString('hex');

  const secrets = Object.keys(obj).map((key) => {
    // encrypt key
    const {
      ciphertext: ciphertextKey,
      iv: ivKey,
      tag: tagKey
    } = encryptSymmetric({
      plaintext: key,
      key: randomBytes
    });

    // encrypt value
    const {
      ciphertext: ciphertextValue,
      iv: ivValue,
      tag: tagValue
    } = encryptSymmetric({
      plaintext: obj[key],
      key: randomBytes
    });

    const visibility = 'shared';

    return {
      ciphertextKey,
      ivKey,
      tagKey,
      hashKey: crypto.createHash('sha256').update(key).digest('hex'),
      ciphertextValue,
      ivValue,
      tagValue,
      hashValue: crypto.createHash('sha256').update(obj[key]).digest('hex'),
      type: visibility
    };
  });

  // obtain public keys of all receivers (i.e. members in workspace)
  const publicKeyInfisical = await publicKeyInfical();

  const publicKey = (await publicKeyInfisical.json()).publicKey;

  // assymmetrically encrypt key with each receiver public keys

  const { ciphertext, nonce } = encryptAssymmetric({
    plaintext: randomBytes,
    publicKey,
    privateKey: PRIVATE_KEY
  });

  const key = {
    encryptedKey: ciphertext,
    nonce
  };

  changeHerokuConfigVars({ integrationId, key, secrets });
};

export default pushKeysIntegration;
