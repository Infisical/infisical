export interface IGenerateKeyPairOutput {
    publicKey: string;
    privateKey: string
}

export interface IEncryptAsymmetricInput {
    plaintext: string;
    publicKey: string;
    privateKey: string;
}

export interface IEncryptAsymmetricOutput {
    ciphertext: string;
    nonce: string;
}

export interface IDecryptAsymmetricInput {
    ciphertext: string;
    nonce: string;
    publicKey: string;
    privateKey: string;
}

export interface IEncryptSymmetricInput {
    plaintext: string;
    key: string;
}

export interface IEncryptSymmetricOutput {
    ciphertext: string;
    iv: string;
    tag: string;
}

export interface IDecryptSymmetricInput {
    ciphertext: string;
    iv: string;
    tag: string;
    key: string;
}

