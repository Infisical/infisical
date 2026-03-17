package pg

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"fmt"
	"math/rand/v2"
	"net/url"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DBReadReplica holds connection details for a single read replica.
type DBReadReplica struct {
	DBConnectionURI string
	DBRootCert      string
}

// DB wraps a primary pgxpool and zero or more read-replica pools.
type DB struct {
	primary  *pgxpool.Pool
	replicas []*pgxpool.Pool
}

// NewPostgresDB creates a connection pool for the primary database and optional read replicas.
// primaryRootCert is used as fallback for replicas that don't specify their own cert.
func NewPostgresDB(ctx context.Context, primaryURI, primaryRootCert string, readReplicas []DBReadReplica) (*DB, error) {
	primaryPool, err := openPool(ctx, primaryURI, primaryRootCert)
	if err != nil {
		return nil, fmt.Errorf("primary db: %w", err)
	}

	replicaPools := make([]*pgxpool.Pool, 0, len(readReplicas))
	for i, r := range readReplicas {
		// Fall back to primary root cert if replica doesn't have its own.
		rootCert := r.DBRootCert
		if rootCert == "" {
			rootCert = primaryRootCert
		}

		pool, err := openPool(ctx, r.DBConnectionURI, rootCert)
		if err != nil {
			// Close already-opened pools on failure.
			primaryPool.Close()
			for _, p := range replicaPools {
				p.Close()
			}
			return nil, fmt.Errorf("read replica %d: %w", i, err)
		}
		replicaPools = append(replicaPools, pool)
	}

	return &DB{primary: primaryPool, replicas: replicaPools}, nil
}

// Primary returns the primary connection pool.
func (db *DB) Primary() *pgxpool.Pool {
	return db.primary
}

// ReplicaNode returns a random read-replica pool, or the primary if no replicas are configured.
// Matches the Node.js behavior: Math.floor(Math.random() * readReplicaDbs.length).
func (db *DB) ReplicaNode() *pgxpool.Pool {
	if len(db.replicas) == 0 {
		return db.primary
	}
	return db.replicas[rand.IntN(len(db.replicas))]
}

// Replicas returns all read-replica pools.
func (db *DB) Replicas() []*pgxpool.Pool {
	return db.replicas
}

// Close closes all connection pools (primary + replicas).
func (db *DB) Close() {
	db.primary.Close()
	for _, r := range db.replicas {
		r.Close()
	}
}

// openPool creates a pgxpool.Pool from a connection URI and optional base64-encoded root CA cert.
// It mirrors the Node.js parseSslConfig logic:
//   - If dbRootCert is set, TLS is enabled with that CA.
//   - If the URI contains sslmode=verify-ca or verify-full, rejectUnauthorized is true (InsecureSkipVerify = false).
//   - Otherwise when a cert is provided but sslmode is something else (e.g. require), the CA is trusted
//     but server identity is not strictly verified (InsecureSkipVerify = true).
//   - The sslmode param is stripped from the URI before passing to pgx (pgx handles TLS via its own config).
func openPool(ctx context.Context, connURI, dbRootCert string) (*pgxpool.Pool, error) {
	modifiedURI, tlsCfg, err := parseSslConfig(connURI, dbRootCert)
	if err != nil {
		return nil, err
	}

	poolCfg, err := pgxpool.ParseConfig(modifiedURI)
	if err != nil {
		return nil, fmt.Errorf("parsing connection URI: %w", err)
	}

	poolCfg.MinConns = 0
	poolCfg.MaxConns = 10

	if tlsCfg != nil {
		poolCfg.ConnConfig.TLSConfig = tlsCfg
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("creating pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pinging database: %w", err)
	}

	return pool, nil
}

// parseSslConfig mirrors the Node.js parseSslConfig function.
// It returns a potentially modified URI (sslmode stripped) and TLS config.
func parseSslConfig(connURI, dbRootCert string) (string, *tls.Config, error) {
	if dbRootCert == "" {
		return connURI, nil, nil
	}

	// Decode the base64-encoded CA certificate.
	caPEM, err := base64.StdEncoding.DecodeString(dbRootCert)
	if err != nil {
		return "", nil, fmt.Errorf("decoding DB_ROOT_CERT base64: %w", err)
	}

	certPool := x509.NewCertPool()
	if !certPool.AppendCertsFromPEM(caPEM) {
		return "", nil, fmt.Errorf("failed to parse DB root certificate PEM")
	}

	// Default: trust the CA but don't strictly verify server identity
	// (matches Node.js rejectUnauthorized: false with a CA present).
	tlsCfg := &tls.Config{
		RootCAs:            certPool,
		InsecureSkipVerify: true,
	}

	modifiedURI := connURI

	// Check sslmode in the URI.
	parsed, err := url.Parse(connURI)
	if err == nil {
		sslMode := parsed.Query().Get("sslmode")
		if sslMode != "" && !strings.EqualFold(sslMode, "disable") {
			// Strip sslmode — we handle TLS ourselves via pgx TLSConfig.
			q := parsed.Query()
			q.Del("sslmode")
			parsed.RawQuery = q.Encode()
			modifiedURI = parsed.String()

			// verify-ca and verify-full → reject unauthorized (InsecureSkipVerify = false).
			if strings.EqualFold(sslMode, "verify-ca") || strings.EqualFold(sslMode, "verify-full") {
				tlsCfg.InsecureSkipVerify = false
			}
		}
	}

	return modifiedURI, tlsCfg, nil
}
