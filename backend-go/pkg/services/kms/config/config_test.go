package config

import "testing"

func setValidEnvironment(t *testing.T) {
	t.Helper()
	t.Setenv("DB_CONNECTION_URI", "postgres://localhost/infisical")
	t.Setenv("REDIS_URL", "redis://localhost:6379")
	t.Setenv("ROOT_ENCRYPTION_KEY", "root-key")
}

func TestLoadConfig_DefaultsAndDerivedFields(t *testing.T) {
	setValidEnvironment(t)

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}

	if cfg.KMSGRPCPort != "4040" || cfg.KMSGRPCAddr != "127.0.0.1" || cfg.NodeEnv != NodeEnvProduction {
		t.Fatalf("unexpected defaults: grpcPort=%q grpcAddr=%q nodeEnv=%q", cfg.KMSGRPCPort, cfg.KMSGRPCAddr, cfg.NodeEnv)
	}
	if !cfg.IsProductionMode || !cfg.IsRedisConfigured || cfg.IsHsmConfigured {
		t.Fatalf("unexpected derived fields: %+v", cfg)
	}
}

func TestLoadConfig_ParsesReplicaJSON(t *testing.T) {
	setValidEnvironment(t)
	t.Setenv("DB_READ_REPLICAS", `[{"DB_CONNECTION_URI":"postgres://replica/infisical"}]`)

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}
	if len(cfg.DBReadReplicas) != 1 || cfg.DBReadReplicas[0].DBConnectionURI != "postgres://replica/infisical" {
		t.Fatalf("unexpected replicas: %+v", cfg.DBReadReplicas)
	}
}

func TestLoadConfig_RejectsMissingRequiredAlternatives(t *testing.T) {
	for _, key := range []string{"DB_CONNECTION_URI", "DB_HOST", "DB_USER", "DB_NAME", "REDIS_URL", "REDIS_SENTINEL_HOSTS", "REDIS_CLUSTER_HOSTS", "ENCRYPTION_KEY", "ROOT_ENCRYPTION_KEY"} {
		t.Setenv(key, "")
	}
	if _, err := LoadConfig(); err == nil {
		t.Fatal("LoadConfig() error = nil, want validation error")
	}
}

func TestLoadConfig_ParsesRedisHostLists(t *testing.T) {
	setValidEnvironment(t)
	t.Setenv("REDIS_SENTINEL_HOSTS", "sentinel-a:26379,sentinel-b")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}
	if len(cfg.ParsedRedisSentinelHosts) != 2 || cfg.ParsedRedisSentinelHosts[0].Port != 26379 || cfg.ParsedRedisSentinelHosts[1].Host != "sentinel-b" {
		t.Fatalf("unexpected sentinel hosts: %+v", cfg.ParsedRedisSentinelHosts)
	}
}

func TestLoadConfig_RejectsInvalidRedisHostPort(t *testing.T) {
	setValidEnvironment(t)
	t.Setenv("REDIS_SENTINEL_HOSTS", "sentinel-a:70000")

	if _, err := LoadConfig(); err == nil {
		t.Fatal("LoadConfig() error = nil, want validation error")
	}
}

func TestConfigAddr(t *testing.T) {
	cfg := Config{KMSGRPCAddr: "::1", KMSGRPCPort: "4040"}
	if got, want := cfg.Addr(), "[::1]:4040"; got != want {
		t.Fatalf("Addr() = %q, want %q", got, want)
	}
}

func TestConfigValidateRejectsInvalidGRPCEndpoint(t *testing.T) {
	base := Config{
		NodeEnv:           NodeEnvProduction,
		DBConnectionURI:   "postgres://localhost/infisical",
		RedisURL:          "redis://localhost:6379",
		RootEncryptionKey: "root-key",
		KMSGRPCAddr:       "127.0.0.1",
		KMSGRPCPort:       "4040",
	}

	tests := []struct {
		name   string
		mutate func(*Config)
	}{
		{name: "empty address", mutate: func(c *Config) { c.KMSGRPCAddr = " " }},
		{name: "non numeric port", mutate: func(c *Config) { c.KMSGRPCPort = "grpc" }},
		{name: "out of range port", mutate: func(c *Config) { c.KMSGRPCPort = "65536" }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := base
			tt.mutate(&cfg)
			if err := cfg.Validate(); err == nil {
				t.Fatal("Validate() error = nil, want validation error")
			}
		})
	}
}

func TestLoadConfig_RejectsInvalidGRPCEndpoint(t *testing.T) {
	tests := []struct {
		name string
		addr string
		port string
	}{
		{name: "empty address", addr: " ", port: "4040"},
		{name: "non numeric port", addr: "127.0.0.1", port: "grpc"},
		{name: "out of range port", addr: "127.0.0.1", port: "65536"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setValidEnvironment(t)
			t.Setenv("KMS_GRPC_ADDR", tt.addr)
			t.Setenv("KMS_GRPC_PORT", tt.port)
			if _, err := LoadConfig(); err == nil {
				t.Fatal("LoadConfig() error = nil, want validation error")
			}
		})
	}
}

func TestLoadConfig_ParsesRaftConfiguration(t *testing.T) {
	setValidEnvironment(t)
	t.Setenv("DISABLE_RAFT", "false")
	t.Setenv("RAFT_NODE_ID", "2")
	t.Setenv("RAFT_PEERS", "http://kms-1:2380, http://kms-2:2380")
	t.Setenv("RAFT_WAL_DIR", "/var/lib/kms/wal")
	t.Setenv("RAFT_SNAPSHOT_DIR", "/var/lib/kms/snapshots")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}
	if len(cfg.RaftPeers) != 2 || cfg.RaftPeers[1] != "http://kms-2:2380" {
		t.Fatalf("unexpected Raft peers: %+v", cfg.RaftPeers)
	}
}

func TestLoadConfig_RejectsIncompleteRaftConfiguration(t *testing.T) {
	setValidEnvironment(t)
	t.Setenv("DISABLE_RAFT", "false")

	if _, err := LoadConfig(); err == nil {
		t.Fatal("LoadConfig() error = nil, want validation error")
	}
}

func TestLoadConfig_RejectsInvalidRaftPeer(t *testing.T) {
	setValidEnvironment(t)
	t.Setenv("DISABLE_RAFT", "false")
	t.Setenv("RAFT_NODE_ID", "1")
	t.Setenv("RAFT_PEERS", "kms-1:2380")
	t.Setenv("RAFT_WAL_DIR", "/var/lib/kms/wal")
	t.Setenv("RAFT_SNAPSHOT_DIR", "/var/lib/kms/snapshots")

	if _, err := LoadConfig(); err == nil {
		t.Fatal("LoadConfig() error = nil, want validation error")
	}
}
