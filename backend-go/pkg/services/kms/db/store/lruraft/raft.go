package lruraft

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"time"

	"go.etcd.io/etcd/client/pkg/v3/fileutil"
	"go.etcd.io/etcd/client/pkg/v3/types"
	"go.etcd.io/etcd/server/v3/etcdserver/api/rafthttp"
	"go.etcd.io/etcd/server/v3/etcdserver/api/snap"
	"go.etcd.io/etcd/server/v3/etcdserver/api/v2stats"
	"go.etcd.io/etcd/server/v3/storage/wal"
	"go.etcd.io/raft/v3"
	"go.etcd.io/raft/v3/raftpb"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

const MaxSizePerMSg = 1024 * 1024

// MaxInflightMessages bounds raft's in-flight message queue.
const MaxInflightMessages = 256

type Commit struct {
	Data        []byte
	DoneApplyCh chan bool
	IsSnapshot  bool
	EntryIndex  uint64
}

type raftLRUNode struct {
	// peer communication initalizers
	proposeCh      <-chan []byte
	modifyConfigCh <-chan *raftpb.ConfChange
	CommitCh       chan<- *Commit

	// node internal channels
	ErrorC chan<- error

	id                   uint64
	peers                []string // dynamic peers ?
	clusterBootstrapDone bool     // true when joining an existing cluster

	// state storage paths
	dirWal      string
	dirSnapshot string

	// method to retrieve latest data from
	getSnapshot func() ([]byte, error)

	confState          *raftpb.ConfState
	snapshotIndex      uint64 // index of current snapshot
	appliedCommitIndex uint64 // index of late

	// raft backing for the commit/error channel
	node        raft.Node
	raftStorage *raft.MemoryStorage
	wal         *wal.WAL

	snapshotter      *snap.Snapshotter
	snapshotterReady chan *snap.Snapshotter // signals when snapshotter is ready
	initialSnapshot  []byte
	snapCount        uint64

	transport *rafthttp.Transport

	closedProposalCh       chan struct{} // signals proposal channel closed
	httpStopCh             chan struct{} // signals http server to shutdown
	httpShutDownCompleteCh chan struct{} // signals http server shutdown complete

	logger *zap.Logger
}

var defaultSnapshotCount uint64 = 10000

type Options struct {
	ID                   uint64
	Peers                []string
	ClusterBootstrapDone bool
	DirWal               string
	DirSnapshot          string

	GetSnapshot func() ([]byte, error)

	ProposeCh      <-chan []byte
	ModifyConfigCh <-chan *raftpb.ConfChange
}

func raftLoggerFromSlog(Id uint64) raft.Logger {
	baseLogger := slog.Default().With("raft_id", Id)
	logger := &raft.DefaultLogger{
		Logger: slog.NewLogLogger(baseLogger.Handler(), slog.LevelInfo),
	}
	if baseLogger.Handler().Enabled(context.Background(), slog.LevelDebug) {
		logger.EnableDebug()
	}
	return logger
}

func NewLRURaftNode(opts Options) (<-chan *Commit, <-chan error, chan *snap.Snapshotter, error) {
	if opts.ID == 0 {
		return nil, nil, nil, fmt.Errorf("raft node ID must be greater than zero")
	}
	if opts.ProposeCh == nil {
		return nil, nil, nil, fmt.Errorf("raft proposal channel is required")
	}
	if len(opts.Peers) == 0 {
		return nil, nil, nil, fmt.Errorf("at least one raft peer is required")
	}
	if opts.ID > uint64(len(opts.Peers)) {
		return nil, nil, nil, fmt.Errorf("raft node ID %d exceeds peer count %d", opts.ID, len(opts.Peers))
	}
	if opts.DirWal == "" || opts.DirSnapshot == "" {
		return nil, nil, nil, fmt.Errorf("raft WAL and snapshot directories are required")
	}
	if opts.GetSnapshot == nil {
		return nil, nil, nil, fmt.Errorf("snapshot provider is required")
	}

	commitCh := make(chan *Commit)
	errorCh := make(chan error, 1)

	node := &raftLRUNode{
		proposeCh:            opts.ProposeCh,
		modifyConfigCh:       opts.ModifyConfigCh,
		id:                   opts.ID,
		peers:                opts.Peers,
		clusterBootstrapDone: opts.ClusterBootstrapDone,
		dirWal:               opts.DirWal,
		dirSnapshot:          opts.DirSnapshot,
		getSnapshot:          opts.GetSnapshot,
		snapCount:            defaultSnapshotCount,
		ErrorC:               errorCh,
		CommitCh:             commitCh,
		logger:               zapLoggerFromSlogDefaults(),

		httpStopCh: make(chan struct{}),
		// internal channel to stop the node
		closedProposalCh:       make(chan struct{}),
		httpShutDownCompleteCh: make(chan struct{}),
		snapshotterReady:       make(chan *snap.Snapshotter, 1),
	}

	go node.initRaft(context.Background())

	return commitCh, errorCh, node.snapshotterReady, nil
}

func zapLoggerFromSlogDefaults() *zap.Logger {
	return zap.New(slogZapCore{slog.Default()})
}

type slogZapCore struct{ logger *slog.Logger }

func (c slogZapCore) Enabled(_ zapcore.Level) bool        { return true }
func (c slogZapCore) With(_ []zapcore.Field) zapcore.Core { return c }
func (c slogZapCore) Check(entry zapcore.Entry, checked *zapcore.CheckedEntry) *zapcore.CheckedEntry {
	if c.Enabled(entry.Level) {
		return checked.AddCore(entry, c)
	}
	return checked
}
func (c slogZapCore) Write(entry zapcore.Entry, fields []zapcore.Field) error {
	level := slog.LevelInfo
	switch {
	case entry.Level >= zapcore.ErrorLevel:
		level = slog.LevelError
	case entry.Level >= zapcore.WarnLevel:
		level = slog.LevelWarn
	case entry.Level <= zapcore.DebugLevel:
		level = slog.LevelDebug
	}
	if len(fields) > 0 {
		entry.Message = fmt.Sprintf("%s (%v)", entry.Message, fields)
	}
	c.logger.Log(context.Background(), level, entry.Message)
	return nil
}
func (slogZapCore) Sync() error { return nil }

func (rc *raftLRUNode) reportError(err error) {
	if err == nil {
		return
	}
	select {
	case rc.ErrorC <- err:
	default:
		slog.Default().Error("dropping Raft error because the error channel is full", "error", err)
	}
}

func (rc *raftLRUNode) initRaft(ctx context.Context) {
	initialized := false
	defer func() {
		close(rc.snapshotterReady)
		if !initialized {
			close(rc.CommitCh)
			close(rc.ErrorC)
		}
	}()

	if !fileutil.Exist(rc.dirSnapshot) {
		if err := os.MkdirAll(rc.dirSnapshot, 0o750); err != nil {
			rc.reportError(fmt.Errorf("create raft snapshot directory: %w", err))
			return
		}
	}

	rc.snapshotter = snap.New(zapLoggerFromSlogDefaults(), rc.dirSnapshot)

	oldwal := wal.Exist(rc.dirWal)
	wal, err := rc.replayWAL()
	if err != nil {
		rc.reportError(fmt.Errorf("replay raft WAL: %w", err))
		return
	}

	rc.wal = wal

	// signal replay has finished
	rc.snapshotterReady <- rc.snapshotter

	rpeers := make([]raft.Peer, len(rc.peers))
	for i := range rpeers {
		rpeers[i] = raft.Peer{ID: uint64(i + 1)}
	}

	c := &raft.Config{
		ID:                        uint64(rc.id),
		ElectionTick:              10,
		HeartbeatTick:             1,
		Storage:                   rc.raftStorage,
		MaxSizePerMsg:             MaxSizePerMSg,
		MaxInflightMsgs:           MaxInflightMessages,
		MaxUncommittedEntriesSize: 1 << 30,
		Logger:                    raftLoggerFromSlog(rc.id),
	}

	if oldwal || rc.clusterBootstrapDone {
		rc.node = raft.RestartNode(c)
	} else {
		rc.node = raft.StartNode(c, rpeers)
	}

	rc.transport = &rafthttp.Transport{
		Logger:      rc.logger,
		ID:          types.ID(rc.id),
		ClusterID:   0x1000,
		Raft:        rc,
		ServerStats: v2stats.NewServerStats("", ""),
		LeaderStats: v2stats.NewLeaderStats(zapLoggerFromSlogDefaults(), strconv.Itoa(int(rc.id))),
		ErrorC:      make(chan error, 1),
	}

	if err := rc.transport.Start(); err != nil {
		rc.reportError(fmt.Errorf("start raft transport: %w", err))
		return
	}
	for i := range rc.peers {
		if uint64(i+1) != rc.id {
			rc.transport.AddPeer(types.ID(i+1), []string{rc.peers[i]})
		}
	}

	initialized = true
	go func() {
		if err := rc.serveRaft(); err != nil {
			rc.reportError(err)
		}
	}()
	go rc.serveChannels(ctx)
	return
}

// stop closes http, closes all channels, and stops raft.
func (rc *raftLRUNode) stop() {
	rc.stopHTTP()
	close(rc.CommitCh)
	close(rc.ErrorC)
	rc.node.Stop()
}

func (rc *raftLRUNode) stopHTTP() {
	rc.transport.Stop()
	close(rc.httpStopCh)
	<-rc.httpShutDownCompleteCh
}

func (rc *raftLRUNode) serveChannels(ctx context.Context) {
	snap, err := rc.raftStorage.Snapshot()
	if err != nil {
		rc.writeError(fmt.Errorf("load initial raft snapshot: %w", err))
		return
	}
	rc.confState = snap.Metadata.ConfState
	rc.snapshotIndex = snap.Metadata.GetIndex()
	rc.appliedCommitIndex = snap.Metadata.GetIndex()

	defer rc.wal.Close()

	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	if len(rc.initialSnapshot) > 0 {
		if err := rc.publishSnapshotData(rc.initialSnapshot); err != nil {
			rc.writeError(fmt.Errorf("restore initial raft snapshot: %w", err))
			return
		}
	}

	// send proposals over raft
	go func() {
		confChangeCount := uint64(0)

		for rc.proposeCh != nil && rc.modifyConfigCh != nil {
			select {
			case prop, ok := <-rc.proposeCh:
				if !ok {
					rc.proposeCh = nil
				} else {
					// todo: for unexpected outage handle dropped proposals by reading back from db via kubernetes operator
					// on restart proposal queue > unsent_by_raft .. sqlite_replay .. diff_db_sync

					// blocks until accepted by raft state machine
					slog.Default().Debug("Raft proposal accepted", slog.Time("event_time", time.Now().UTC()), slog.Int("payload_bytes", len(prop)))
					rc.node.Propose(ctx, prop)
				}

			case cc, ok := <-rc.modifyConfigCh:
				if !ok {
					rc.modifyConfigCh = nil
				} else {
					confChangeCount++
					cc.Id = new(confChangeCount)
					rc.node.ProposeConfChange(ctx, cc)
				}
			}
		}
		// client closed channel; shutdown raft if not already
		close(rc.closedProposalCh)
	}()

	// event loop on raft state machine updates
	for {
		select {
		case <-ticker.C:
			rc.node.Tick()
		// store raft entries to wal, then publish over commit channel
		case rd := <-rc.node.Ready():
			slog.Default().Debug("raft", "Raft node ready", slog.Time("event_time", time.Now().UTC()), slog.Int("entries", len(rd.Entries)), slog.Int("committed_entries", len(rd.CommittedEntries)), slog.Bool("has_snapshot", !raft.IsEmptySnap(rd.Snapshot)))
			// Must save the snapshot file and WAL snapshot entry before saving any other entries
			// or hardstate to ensure that recovery after a snapshot restore is possible.
			if !raft.IsEmptySnap(rd.Snapshot) {
				if err := rc.saveSnap(rd.Snapshot); err != nil {
					rc.writeError(fmt.Errorf("save raft snapshot from ready state: %w", err))
					return
				}
			}
			var hs *raftpb.HardState
			if !raft.IsEmptyHardState(rd.HardState) {
				hs = rd.HardState
			}
			if err := rc.wal.Save(hs, rd.Entries); err != nil {
				rc.writeError(fmt.Errorf("save raft WAL entries: %w", err))
				return
			}
			if !raft.IsEmptySnap(rd.Snapshot) {
				if err := rc.raftStorage.ApplySnapshot(rd.Snapshot); err != nil {
					rc.writeError(fmt.Errorf("apply raft snapshot: %w", err))
					return
				}
				if err := rc.publishSnapshot(rd.Snapshot); err != nil {
					rc.writeError(fmt.Errorf("publish raft snapshot: %w", err))
					return
				}
			}
			if err := rc.raftStorage.Append(rd.Entries); err != nil {
				rc.writeError(fmt.Errorf("append raft entries: %w", err))
				return
			}
			rc.transport.Send(rc.processMessages(rd.Messages))
			entriesToApply, err := rc.entriesToApply(rd.CommittedEntries)
			if err != nil {
				rc.writeError(err)
				return
			}
			applyDoneC, ok, err := rc.publishEntries(entriesToApply)
			if err != nil {
				rc.writeError(err)
				return
			}
			if !ok {
				rc.stop()
				return
			}
			if err := rc.maybeTriggerSnapshot(applyDoneC); err != nil {
				rc.writeError(err)
				return
			}
			rc.node.Advance()

		case transportErr, ok := <-rc.transport.ErrorC:
			if !ok {
				rc.writeError(fmt.Errorf("raft transport error channel closed"))
				return
			}
			rc.writeError(transportErr)
			return

		case <-rc.closedProposalCh:
			rc.stop()
			return
		}
	}
}

func (rc *raftLRUNode) serveRaft() error {
	url, err := url.Parse(rc.peers[rc.id-1])
	if err != nil {
		return fmt.Errorf("parse raft peer URL: %w", err)
	}

	ln, err := newStoppableListener(url.Host, rc.httpStopCh)
	if err != nil {
		return fmt.Errorf("listen for rafthttp: %w", err)
	}
	defer close(rc.httpShutDownCompleteCh)

	err = (&http.Server{Handler: rc.transport.Handler()}).Serve(ln)
	select {
	case <-rc.httpStopCh:
	default:
		return fmt.Errorf("serve rafthttp: %w", err)
	}
	return nil
}

func (rc *raftLRUNode) Process(ctx context.Context, m *raftpb.Message) error {
	return rc.node.Step(ctx, m)
}

func (rc *raftLRUNode) writeError(err error) {
	rc.stopHTTP()
	close(rc.CommitCh)
	rc.reportError(err)
	close(rc.ErrorC)
	rc.node.Stop()
}

func (rc *raftLRUNode) IsIDRemoved(id uint64) bool {
	if rc.confState == nil {
		return false
	}
	for _, voter := range rc.confState.Voters {
		if voter == id {
			return false
		}
	}
	for _, learner := range rc.confState.Learners {
		if learner == id {
			return false
		}
	}
	return true
}
func (rc *raftLRUNode) ReportUnreachable(id uint64) { rc.node.ReportUnreachable(id) }
func (rc *raftLRUNode) ReportSnapshot(id uint64, status raft.SnapshotStatus) {
	rc.node.ReportSnapshot(id, status)
}

/*
* onCommit nil
* loadSnapshot > application uses to retrieve snapshot
  bootstrap from snapshot instead of empty cache

  getSnapshot > raft uses to get latest snapshot

  does it survive redployments , guess : yes
  does rd := <-rc.node.Ready(): refire on transport reconnects or other path other than bootstrap ?
  apart from startup path , does it fire anytime else the onCommit(nil) , guess : no , publishSnapshot is called from node.Ready
  **/
