package kms

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"sync"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/pkg/services/kms/db/store"
	kmsproto "github.com/infisical/api/pkg/services/kms/gen/proto"
)

// KmsRootConfigUUID is the fixed UUID for the single kms_root_config row.
var KmsRootConfigUUID = uuid.MustParse("00000000-0000-0000-0000-000000000000")

// superAdminConfigUUID is the fixed UUID for the single super_admin config row.
var superAdminConfigUUID = uuid.MustParse("00000000-0000-0000-0000-000000000000")

const (
	// KMSVersion is the version tag appended to all KMS-encrypted blobs.
	KMSVersion = "v01"
	// KMSVersionBlobLength is the byte length of KMSVersion.
	KMSVersionBlobLength = 3

	// PgLockKmsRootKeyInit is the advisory lock ID for root config initialization.
	// Must match the Node.js backend value (PgSqlLock.KmsRootKeyInit = 2025).
	PgLockKmsRootKeyInit int64 = 2025
)

// RootKeyEncryptionStrategy determines how the root key is encrypted at rest.
type RootKeyEncryptionStrategy string

const (
	StrategyHSM      RootKeyEncryptionStrategy = "HSM"
	StrategySoftware RootKeyEncryptionStrategy = "SOFTWARE"
)

type Service struct {
	KmsStore         store.KMSStore
	kmsInternalStore store.InternalKMSStore

	rootEncryptionKeyMu *sync.RWMutex
	rootEncryptionKey   []byte // loaded during Start(), protected by mu

	logger        *slog.Logger
	encryptionKey []byte             // decoded during Start(), used to decrypt root key
	db            pg.DB              // database operations
	hsm           HsmService         // nil when HSM is not configured
	externalKms   ExternalKmsService // nil when external KMS is not configured

	// Raw config values - decoded during Start() based on FIPS mode
	rawEncryptionKey     string
	rawRootEncryptionKey string
	envFipsEnabled       bool
	kmsproto.UnimplementedKMSServiceServer
}

type Options struct {
	DB                pg.DB
	HSM               HsmService         // nil when HSM is not configured
	ExternalKms       ExternalKmsService // nil when external KMS is not configured
	EncryptionKey     string
	RootEncryptionKey string
	FipsEnabled       bool
	DisableCache      bool
}

// New creates a new KMS service.
// The encryption key is decoded during Start() based on FIPS mode determination.
func New(_ context.Context, options *Options) (*Service, error) {
	var keyMetaCache *store.KeyMetaCache
	if !options.DisableCache {
		keyMetaCache = store.NewKeyMetaCache()
	}
	return &Service{
		KmsStore: store.NewKMSStore(options.DB, &store.KmsStoreOptions{
			KmsMetaCache: keyMetaCache,
		}),
		kmsInternalStore:     store.NewInternalKMSStore(),
		rootEncryptionKeyMu:  &sync.RWMutex{},
		logger:               slog.Default().With(slog.String("svc", "kms")),
		db:                   options.DB,
		hsm:                  options.HSM,
		externalKms:          options.ExternalKms,
		rawEncryptionKey:     options.EncryptionKey,
		rawRootEncryptionKey: options.RootEncryptionKey,
		envFipsEnabled:       options.FipsEnabled,
	}, nil
}

// init bootstraps the KMS root key. It must be called once during server startup
// before any calls to CreateCipherPairWithOrgDataKey or CreateCipherPairWithProjectDataKey.
//
// It atomically finds or creates the root config in the database (using a PG advisory lock),
// then decrypts the root key into memory.
func (s *Service) Init(ctx context.Context, hsmConfigured bool) error {
	strategy := StrategySoftware
	if hsmConfigured {
		strategy = StrategyHSM
	}
	s.rootEncryptionKeyMu.Lock()
	defer s.rootEncryptionKeyMu.Unlock()

	if err := s.resolveEncryptionKey(ctx); err != nil {
		return fmt.Errorf("KMS: resolving encryption key: %w", err)
	}

	rootConfig, err := s.findOrCreateRootConfig(ctx, hsmConfigured, strategy)
	if err != nil {
		return errutil.DatabaseErr("Failed to find or create KMS root config").WithErrf("Start: %w", err)
	}

	decryptedRootKey, err := s.decryptRootKey(rootConfig)
	if err != nil {
		return fmt.Errorf("KMS: decrypting root key: %w", err)
	}

	s.rootEncryptionKey = decryptedRootKey
	return nil
}

// Close zeroes the root encryption key from memory.
func (s *Service) Close() {
	s.rootEncryptionKeyMu.Lock()
	defer s.rootEncryptionKeyMu.Unlock()
	for i := range s.rootEncryptionKey {
		s.rootEncryptionKey[i] = 0
	}
	s.rootEncryptionKey = nil
	for i := range s.encryptionKey {
		s.encryptionKey[i] = 0
	}
	s.encryptionKey = nil
}

// resolveEncryptionKey decodes the encryption key based on FIPS mode.
// ROOT_ENCRYPTION_KEY takes precedence and is always base64-encoded.
// ENCRYPTION_KEY is base64-encoded in FIPS mode, raw 32-char string otherwise.
func (s *Service) resolveEncryptionKey(ctx context.Context) error {
	if s.rawRootEncryptionKey != "" {
		decoded, err := base64.StdEncoding.DecodeString(s.rawRootEncryptionKey)
		if err != nil {
			return fmt.Errorf("failed to decode ROOT_ENCRYPTION_KEY from base64: %w", err)
		}
		s.encryptionKey = decoded
		return nil
	}

	fipsEnabled := false
	if s.envFipsEnabled {
		superAdminConfig, err := s.findSuperAdminConfig(ctx)
		if err != nil {
			return fmt.Errorf("failed to query super_admin config for FIPS mode: %w", err)
		}
		fipsEnabled = superAdminConfig != nil && superAdminConfig.FipsEnabled
	}

	if s.rawEncryptionKey == "" {
		return fmt.Errorf("ENCRYPTION_KEY or ROOT_ENCRYPTION_KEY is required")
	}

	if fipsEnabled {
		decoded, err := base64.StdEncoding.DecodeString(s.rawEncryptionKey)
		if err != nil {
			return fmt.Errorf("failed to decode ENCRYPTION_KEY from base64 (FIPS mode): %w", err)
		}
		s.encryptionKey = decoded
	} else {
		s.encryptionKey = []byte(s.rawEncryptionKey)
	}
	return nil
}

func (s *Service) getRootKey() []byte {
	s.rootEncryptionKeyMu.RLock()
	defer s.rootEncryptionKeyMu.RUnlock()
	if len(s.rootEncryptionKey) == 0 {
		return nil
	}
	keyCopy := make([]byte, len(s.rootEncryptionKey))
	copy(keyCopy, s.rootEncryptionKey)
	return keyCopy
}

func a() {
	var _ kmsproto.KMSServiceServer = Service{}
}
