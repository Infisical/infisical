#include "ed25519ph.h"

#include <openssl/err.h>
#include <openssl/pem.h>
#include <openssl/x509.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * The CLI accepts only pre-hashed Ed25519ph input. Both operations require:
 *   -pkeyopt digest:Ed25519ph
 */

static unsigned char *read_file(const char *path, size_t *len)
{
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;

    if (fseek(f, 0, SEEK_END) != 0) {
        fclose(f);
        return NULL;
    }

    long size = ftell(f);
    if (size < 0 || fseek(f, 0, SEEK_SET) != 0) {
        fclose(f);
        return NULL;
    }

    unsigned char *buf = OPENSSL_malloc(size > 0 ? (size_t)size : 1);
    if (!buf) {
        fclose(f);
        return NULL;
    }

    size_t bytes_read = fread(buf, 1, (size_t)size, f);
    if (bytes_read != (size_t)size || ferror(f)) {
        OPENSSL_free(buf);
        fclose(f);
        return NULL;
    }

    *len = bytes_read;
    fclose(f);
    return buf;
}

static int write_file(const char *path, const unsigned char *buf, size_t len)
{
    FILE *f = fopen(path, "wb");
    if (!f) return 0;

    size_t written = fwrite(buf, 1, len, f);
    int close_result = fclose(f);
    return written == len && close_result == 0;
}

static EVP_PKEY *load_key(const char *path, int public_key)
{
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;

    EVP_PKEY *key;
    if (public_key) {
        key = PEM_read_PUBKEY(f, NULL, NULL, NULL);
        if (!key) {
            ERR_clear_error();
            rewind(f);
            key = d2i_PUBKEY_fp(f, NULL);
        }
    } else {
        key = PEM_read_PrivateKey(f, NULL, NULL, NULL);
    }
    fclose(f);
    return key;
}

int main(int argc, char **argv)
{
    if (argc == 2 && strcmp(argv[1], "-check") == 0) {
        return ed25519ph_is_available() ? 0 : 1;
    }

    if (argc != 10 ||
        (strcmp(argv[1], "-sign") != 0 && strcmp(argv[1], "-verify") != 0) ||
        strcmp(argv[2], "-inkey") != 0 || strcmp(argv[4], "-in") != 0 ||
        (strcmp(argv[1], "-sign") == 0 ? strcmp(argv[6], "-out") : strcmp(argv[6], "-sigfile")) != 0 ||
        strcmp(argv[8], "-pkeyopt") != 0 || strcmp(argv[9], "digest:Ed25519ph") != 0) {
        return 1;
    }

    int signing = strcmp(argv[1], "-sign") == 0;
    EVP_PKEY *key = load_key(argv[3], !signing);
    if (!key) {
        ERR_print_errors_fp(stderr);
        return 1;
    }

    size_t input_len = 0;
    unsigned char *input = read_file(argv[5], &input_len);
    if (!input) {
        EVP_PKEY_free(key);
        return 1;
    }
    if (input_len != 64) {
        OPENSSL_free(input);
        EVP_PKEY_free(key);
        return 1;
    }

    int exit_code = 1;
    if (signing) {
        unsigned char *signature = NULL;
        size_t signature_len = 0;
        if (ed25519ph_sign(key, input, input_len, &signature, &signature_len)) {
            exit_code = write_file(argv[7], signature, signature_len) ? 0 : 1;
        } else {
            ERR_print_errors_fp(stderr);
        }
        OPENSSL_free(signature);
    } else {
        size_t signature_len = 0;
        unsigned char *signature = read_file(argv[7], &signature_len);
        if (signature && signature_len == 64) {
            int result = ed25519ph_verify(key, input, input_len, signature, signature_len);
            printf(result == 1 ? "Signature Verified Successfully\n" : "Signature Verification Failure\n");
            exit_code = result == 1 ? 0 : 1;
        }
        OPENSSL_free(signature);
    }

    OPENSSL_free(input);
    EVP_PKEY_free(key);
    return exit_code;
}
