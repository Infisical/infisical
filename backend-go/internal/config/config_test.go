package config

import "testing"

func TestConfigValidate_GatewayRaft(t *testing.T) {
	base := Config{
		NodeEnv:            NodeEnvProduction,
		Port:               4040,
		DBConnectionURI:    "postgres://localhost/infisical",
		RedisURL:           "redis://localhost:6379",
		EncryptionKey:      "encryption-key",
		AuthSecret:         "auth-secret",
		GatewayDisableRaft: false,
		GatewayRaftNodeID:  1,
		GatewayRaftPeers: []string{
			"http://gateway-1:2380",
		},
		GatewayRaftWALDir:      "/var/lib/infisical/gateway-raft/wal",
		GatewayRaftSnapshotDir: "/var/lib/infisical/gateway-raft/snapshots",
	}

	if issues := base.validate(); len(issues) != 0 {
		t.Fatalf("validate() issues = %v", issues)
	}

	base.GatewayRaftPeers = []string{"gateway-1:2380"}
	if issues := base.validate(); len(issues) == 0 {
		t.Fatal("validate() issues = nil, want invalid Gateway Raft peer error")
	}
}
