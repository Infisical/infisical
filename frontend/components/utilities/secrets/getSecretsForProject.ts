import getSecrets from '~/pages/api/files/GetSecrets';

import { envMapping } from '../../../public/data/frequentConstants';
import guidGenerator from '../randomId';

const {
  decryptAssymmetric,
  decryptSymmetric
} = require('../cryptography/crypto');
const nacl = require('tweetnacl');
nacl.util = require('tweetnacl-util');

interface Props {
  env: keyof typeof envMapping;
  setFileState: any;
  setIsKeyAvailable: any;
  setData: any;
  workspaceId: string;
}

const getSecretsForProject = async ({
  env,
  setFileState,
  setIsKeyAvailable,
  setData,
  workspaceId
}: Props) => {
  try {
    let file;
    try {
      file = await getSecrets(workspaceId, envMapping[env]);

      setFileState(file);
    } catch (error) {
      console.log('ERROR: Not able to access the latest file');
    }
    // This is called isKeyAvilable but what it really means is if a person is able to create new key pairs
    setIsKeyAvailable(!file.key ? file.secrets.length == 0 : true);

    const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY');

    const tempFileState: { key: string; value: string; type: string }[] = [];
    if (file.key) {
      // assymmetrically decrypt symmetric key with local private key
      const key = decryptAssymmetric({
        ciphertext: file.key.encryptedKey,
        nonce: file.key.nonce,
        publicKey: file.key.sender.publicKey,
        privateKey: PRIVATE_KEY
      });

      file.secrets.map((secretPair: any) => {
        // decrypt .env file with symmetric key
        const plainTextKey = decryptSymmetric({
          ciphertext: secretPair.secretKey.ciphertext,
          iv: secretPair.secretKey.iv,
          tag: secretPair.secretKey.tag,
          key
        });

        const plainTextValue = decryptSymmetric({
          ciphertext: secretPair.secretValue.ciphertext,
          iv: secretPair.secretValue.iv,
          tag: secretPair.secretValue.tag,
          key
        });
        tempFileState.push({
          key: plainTextKey,
          value: plainTextValue,
          type: secretPair.type
        });
      });
    }
    setFileState(tempFileState);

    setData(
      tempFileState.map((line, index) => {
        return {
          id: guidGenerator(),
          pos: index,
          key: line['key'],
          value: line['value'],
          type: line['type']
        };
      })
    );

    return tempFileState.map((line, index) => {
      return {
        id: guidGenerator(),
        pos: index,
        key: line['key'],
        value: line['value'],
        type: line['type']
      };
    });
  } catch (error) {
    console.log('Something went wrong during accessing or decripting secrets.');
  }
  return true;
};

export default getSecretsForProject;
