package api

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/redis/go-redis/v9"
	"go.etcd.io/etcd/server/v3/etcdserver/api/snap"
	"go.etcd.io/raft/v3/raftpb"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/ee/services/license"
	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/queue"
	kmsSvc "github.com/infisical/api/internal/server/api/svc/kms"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/pkg/services/kms/db/store"
	"github.com/infisical/api/pkg/services/kms/db/store/lruraft"
)

// Infra holds the external infrastructure dependencies.
type Infra struct {
	Logger   *slog.Logger
	Config   *config.Config
	DB       pg.DB
	Redis    redis.UniversalClient
	HSM      kms.HsmService
	License  *license.Service
	KeyStore keystore.KeyStore
	Queue    *queue.Service
}

// Services holds all initialized services for the API.
type Services struct {
	// in-process modules
	Platform      *PlatformServices
	SecretManager *SecretManagerServices
	// services over gprc
	Kms *kmsSvc.Service
}

func initRaft(ctx context.Context, cfg *config.Config, kmsStore store.KMSStore) (func(), error) {
	logger := slog.Default()
	var commitCh <-chan *lruraft.Commit
	var proposeCh chan []byte
	var modifyConfigCh chan *raftpb.ConfChange
	if !cfg.GatewayDisableCache && !cfg.GatewayDisableRaft {
		proposeCh = make(chan []byte, lruraft.MaxInflightMessages)
		modifyConfigCh = make(chan *raftpb.ConfChange)

		var raftErrCh <-chan error
		var snapshotReadyCh <-chan *snap.Snapshotter
		var err error
		commitCh, raftErrCh, snapshotReadyCh, err = lruraft.NewLRURaftNode(lruraft.Options{
			ID:                   cfg.GatewayRaftNodeID,
			Peers:                cfg.GatewayRaftPeers,
			ClusterBootstrapDone: cfg.GatewayRaftClusterBootstrapDone,
			DirWal:               cfg.GatewayRaftWALDir,
			DirSnapshot:          cfg.GatewayRaftSnapshotDir,
			GetSnapshot:          kmsStore.GetSnapshot,
			ProposeCh:            proposeCh,
			ModifyConfigCh:       modifyConfigCh,
		})

		if err != nil {
			return func() {}, fmt.Errorf("failed to start raft: %v", err)
		}

		go func() {
			for raftErr := range raftErrCh {
				if raftErr != nil {
					kmsStore.DisableCache()
					logger.ErrorContext(ctx, "Raft error", slog.Any("error", raftErr))
				}
			}
		}()

		if snapshotter, ok := <-snapshotReadyCh; !ok || snapshotter == nil {
			kmsStore.DisableCache()
			commitCh = nil
			logger.WarnContext(ctx, "Raft stopped before its snapshot store was ready; continuing with the KMS metadata cache disabled")
		} else {
			kmsStore.SetRaftBridge(store.NewRaftBridge(proposeCh, modifyConfigCh))
		}
	}

	// handle callbacks from peers
	if commitCh != nil {
		raftListener := store.NewRaftListener(commitCh, kmsStore)
		go raftListener.Init()
	}

	return func() {
		// triggers raft stop
		if proposeCh != nil {
			close(proposeCh)
		}
		if modifyConfigCh != nil {
			close(modifyConfigCh)
		}
	}, nil
}

// NewServices creates all services for the API.
// Returns a cleanup function that should be called during graceful shutdown.
func NewServices(ctx context.Context, infra *Infra) (*Services, func(), error) {
	platformSvc, err := newPlatformServices(ctx, infra)
	if err != nil {
		return nil, nil, fmt.Errorf("platform services: %w", err)
	}

	secretManagerSvc := newSecretManagerServices(ctx, infra, platformSvc)

	var keyMetaCache *store.KeyMetaCache

	if !infra.Config.GatewayDisableCache {
		keyMetaCache = store.NewKeyMetaCache()
	}

	// gRPC connection establishment and TLS verification are lazy until the first request.
	kmsSvc, err := kmsSvc.NewKMSService(infra.Config, kmsSvc.Options{
		Permission: platformSvc.Permission,
		KmsStore: store.NewKMSStore(infra.DB,
			&store.KmsStoreOptions{
				KmsMetaCache: keyMetaCache,
			}),
		License: infra.License,
	})

	if err != nil {
		return nil, nil, fmt.Errorf("KMS gRPC client: %w", err)
	}

	closeRaft, err := initRaft(ctx, infra.Config, kmsSvc.KmsStore)

	if err != nil {
		return nil, nil, fmt.Errorf("init raft error: %w", err)
	}

	services := &Services{
		Platform:      platformSvc,
		SecretManager: secretManagerSvc,
		Kms:           kmsSvc,
	}

	cleanup := func() {
		kmsSvc.Close()
		platformSvc.KMS.Close()
		platformSvc.License.Close()
		closeRaft()
	}

	return services, cleanup, nil
}
