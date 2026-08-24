#ifndef OPENSSL_EXT_ED25519PH_H
#define OPENSSL_EXT_ED25519PH_H

#include <openssl/evp.h>

#include <stddef.h>

int ed25519ph_is_available(void);

int ed25519ph_sign(
    EVP_PKEY *key,
    const unsigned char *input,
    size_t input_len,
    unsigned char **signature,
    size_t *signature_len
);

int ed25519ph_verify(
    EVP_PKEY *key,
    const unsigned char *input,
    size_t input_len,
    const unsigned char *signature,
    size_t signature_len
);

#endif
