package hmac

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"fmt"
	"hash"
)

type HmacAlgorithm string

const (
	HMACSHA1   HmacAlgorithm = "HMAC_SHA_1"
	HMACSHA224 HmacAlgorithm = "HMAC_SHA_224"
	HMACSHA256 HmacAlgorithm = "HMAC_SHA_256"
	HMACSHA384 HmacAlgorithm = "HMAC_SHA_384"
	HMACSHA512 HmacAlgorithm = "HMAC_SHA_512"
)

type hmacConfig struct {
	keyByteLength uint8
	hash          string
}

var HMAC_ALGORITHM_CONFIG = map[HmacAlgorithm]hmacConfig{
	HMACSHA1: {
		hash:          "sha1",
		keyByteLength: 20,
	},
	HMACSHA224: {
		hash:          "sha224",
		keyByteLength: 28,
	},
	HMACSHA256: {
		hash:          "sha256",
		keyByteLength: 32,
	},
	HMACSHA384: {
		hash:          "sha384",
		keyByteLength: 48,
	},
	HMACSHA512: {
		hash:          "sha512",
		keyByteLength: 64,
	},
}

func getHash(hashName string) (func() hash.Hash, error) {
	switch hashName {
	case "sha1":
		return sha1.New, nil
	case "sha224":
		return sha256.New224, nil
	case "sha256":
		return sha256.New, nil
	case "sha384":
		return sha512.New384, nil
	case "sha512":
		return sha512.New, nil
	default:
		return nil, fmt.Errorf("unsupported hash: %s", hashName)
	}
}

func GetHmacAlgorithmConfig(algorithm HmacAlgorithm) (hmacConfig, bool) {
	config, ok := HMAC_ALGORITHM_CONFIG[algorithm]
	return config, ok
}

func GenerateMAC(algorithm HmacAlgorithm, data, key []byte) ([]byte, error) {
	config, ok := HMAC_ALGORITHM_CONFIG[algorithm]
	if !ok {
		return nil, fmt.Errorf("unsupported HMAC algorithm: %s", algorithm)
	}

	hashFn, err := getHash(config.hash)
	if err != nil {
		return nil, err
	}

	mac := hmac.New(hashFn, key)
	_, _ = mac.Write(data)

	return mac.Sum(nil), nil
}

func VerifyMAC(algorithm HmacAlgorithm, data, expectedMAC, key []byte) (bool, error) {
	actualMAC, err := GenerateMAC(algorithm, data, key)
	if err != nil {
		return false, err
	}

	return hmac.Equal(actualMAC, expectedMAC), nil
}

func GenerateKeyMaterial(algorithm HmacAlgorithm) ([]byte, error) {
	config, ok := HMAC_ALGORITHM_CONFIG[algorithm]
	if !ok {
		return nil, fmt.Errorf("unsupported HMAC algorithm: %s", algorithm)
	}

	key := make([]byte, config.keyByteLength)

	if _, err := rand.Read(key); err != nil {
		return nil, err
	}

	return key, nil
}

func GetKeyByteLength(algorithm HmacAlgorithm) (uint8, error) {
	config, ok := HMAC_ALGORITHM_CONFIG[algorithm]
	if !ok {
		return 0, fmt.Errorf("unsupported HMAC algorithm: %s", algorithm)
	}

	return config.keyByteLength, nil
}
