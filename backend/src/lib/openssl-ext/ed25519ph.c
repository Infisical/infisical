#include "ed25519ph.h"

int ed25519ph_is_available(void)
{
    EVP_SIGNATURE *algorithm = EVP_SIGNATURE_fetch(NULL, "Ed25519ph", NULL);
    if (!algorithm) return 0;

    EVP_SIGNATURE_free(algorithm);
    return 1;
}

int ed25519ph_sign(
    EVP_PKEY *key,
    const unsigned char *input,
    size_t input_len,
    unsigned char **signature,
    size_t *signature_len
)
{
    if (!signature || !signature_len) return 0;
    *signature = NULL;
    *signature_len = 0;

    EVP_PKEY_CTX *ctx = EVP_PKEY_CTX_new_from_pkey(NULL, key, NULL);
    if (!ctx) return 0;

    EVP_SIGNATURE *algorithm = EVP_SIGNATURE_fetch(NULL, "Ed25519ph", NULL);
    if (!algorithm) {
        EVP_PKEY_CTX_free(ctx);
        return 0;
    }

    if (EVP_PKEY_sign_init_ex2(ctx, algorithm, NULL) <= 0 ||
        EVP_PKEY_sign(ctx, NULL, signature_len, input, input_len) <= 0) {
        EVP_SIGNATURE_free(algorithm);
        EVP_PKEY_CTX_free(ctx);
        return 0;
    }

    EVP_SIGNATURE_free(algorithm);

    *signature = OPENSSL_malloc(*signature_len);
    if (!*signature) {
        EVP_PKEY_CTX_free(ctx);
        return 0;
    }

    int ok = EVP_PKEY_sign(ctx, *signature, signature_len, input, input_len);
    EVP_PKEY_CTX_free(ctx);

    if (ok <= 0) {
        OPENSSL_free(*signature);
        *signature = NULL;
        return 0;
    }

    return 1;
}

int ed25519ph_verify(
    EVP_PKEY *key,
    const unsigned char *input,
    size_t input_len,
    const unsigned char *signature,
    size_t signature_len
)
{
    EVP_PKEY_CTX *ctx = EVP_PKEY_CTX_new_from_pkey(NULL, key, NULL);
    if (!ctx) return -1;

    EVP_SIGNATURE *algorithm = EVP_SIGNATURE_fetch(NULL, "Ed25519ph", NULL);
    if (!algorithm) {
        EVP_PKEY_CTX_free(ctx);
        return -1;
    }

    if (EVP_PKEY_verify_init_ex2(ctx, algorithm, NULL) <= 0) {
        EVP_SIGNATURE_free(algorithm);
        EVP_PKEY_CTX_free(ctx);
        return -1;
    }

    EVP_SIGNATURE_free(algorithm);

    int result = EVP_PKEY_verify(ctx, signature, signature_len, input, input_len);
    EVP_PKEY_CTX_free(ctx);
    return result;
}
