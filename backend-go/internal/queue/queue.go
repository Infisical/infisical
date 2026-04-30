package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
)

// Task represents a typed task definition that ensures payload type safety.
// The generic parameter P defines the expected payload type for this task.
type Task[P any] struct {
	name string
}

// NewTask creates a new typed task definition.
// Usage: var TaskAuditLog = queue.NewTask[auditlog.CreateAuditLogDTO]("audit:log")
func NewTask[P any](name string) Task[P] {
	return Task[P]{name: name}
}

// Name returns the task type name.
func (t Task[P]) Name() string {
	return t.name
}

// EnqueueOpts contains optional parameters for enqueueing a task.
type EnqueueOpts struct {
	maxRetry       *int
	timeout        *time.Duration
	deadline       *time.Time
	uniqueDuration *time.Duration
	queue          *string
	processAt      *time.Time
	processIn      *time.Duration
	retention      *time.Duration
}

// EnqueueOption is a functional option for configuring task enqueueing.
type EnqueueOption func(*EnqueueOpts)

// WithMaxRetry sets the maximum number of retries for a failed task.
func WithMaxRetry(n int) EnqueueOption {
	return func(o *EnqueueOpts) {
		o.maxRetry = &n
	}
}

// WithTimeout sets the timeout duration for task processing.
func WithTimeout(d time.Duration) EnqueueOption {
	return func(o *EnqueueOpts) {
		o.timeout = &d
	}
}

// WithDeadline sets the deadline for task processing.
func WithDeadline(t time.Time) EnqueueOption {
	return func(o *EnqueueOpts) {
		o.deadline = &t
	}
}

// WithUnique ensures only one task with the same payload exists for the given duration.
func WithUnique(d time.Duration) EnqueueOption {
	return func(o *EnqueueOpts) {
		o.uniqueDuration = &d
	}
}

// WithQueue specifies which queue to enqueue the task to.
func WithQueue(name string) EnqueueOption {
	return func(o *EnqueueOpts) {
		o.queue = &name
	}
}

// WithProcessAt schedules the task to be processed at a specific time.
func WithProcessAt(t time.Time) EnqueueOption {
	return func(o *EnqueueOpts) {
		o.processAt = &t
	}
}

// WithProcessIn schedules the task to be processed after the given duration.
func WithProcessIn(d time.Duration) EnqueueOption {
	return func(o *EnqueueOpts) {
		o.processIn = &d
	}
}

// WithRetention sets how long to keep the task in the completed state.
func WithRetention(d time.Duration) EnqueueOption {
	return func(o *EnqueueOpts) {
		o.retention = &d
	}
}

// Handler is a function that processes a task with a typed payload.
type Handler[P any] func(ctx context.Context, payload P) error

// Service provides a type-safe interface for enqueueing and processing tasks.
type Service struct {
	logger      *slog.Logger
	client      *asynq.Client
	mux         *asynq.ServeMux
	redisClient redis.UniversalClient
}

// NewService creates a new queue service using an existing Redis client.
func NewService(logger *slog.Logger, redisClient redis.UniversalClient) *Service {
	client := asynq.NewClientFromRedisClient(redisClient)
	mux := asynq.NewServeMux()

	return &Service{
		logger:      logger.With(slog.String("service", "queue")),
		client:      client,
		mux:         mux,
		redisClient: redisClient,
	}
}

// Enqueue adds a typed task to the queue with the given payload and options.
// The payload type is enforced at compile time via the Task[P] generic parameter.
func Enqueue[P any](s *Service, task Task[P], payload P, opts ...EnqueueOption) error {
	options := &EnqueueOpts{}
	for _, opt := range opts {
		opt(options)
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	asynqOpts := buildAsynqOptions(options)
	asynqTask := asynq.NewTask(task.name, data)

	_, err = s.client.Enqueue(asynqTask, asynqOpts...)
	if err != nil {
		return fmt.Errorf("enqueue task %s: %w", task.name, err)
	}

	s.logger.DebugContext(context.Background(), "task enqueued", slog.String("task", task.name))
	return nil
}

// RegisterHandler registers a typed handler for a task.
// The handler receives the deserialized payload with compile-time type safety.
func RegisterHandler[P any](s *Service, task Task[P], handler Handler[P]) {
	s.mux.HandleFunc(task.name, func(ctx context.Context, t *asynq.Task) error {
		var payload P
		if err := json.Unmarshal(t.Payload(), &payload); err != nil {
			return fmt.Errorf("unmarshal payload for task %s: %w", task.name, err)
		}
		return handler(ctx, payload)
	})
}

// ServerConfig holds configuration for starting the queue worker.
type ServerConfig struct {
	Concurrency int
	LogLevel    asynq.LogLevel
}

// Start begins processing tasks. This is a blocking call.
func (s *Service) Start(cfg ServerConfig) error {
	concurrency := cfg.Concurrency
	if concurrency <= 0 {
		concurrency = 10
	}

	server := asynq.NewServerFromRedisClient(s.redisClient, asynq.Config{
		Concurrency: concurrency,
		LogLevel:    cfg.LogLevel,
		Logger:      newAsynqLogger(s.logger),
	})

	s.logger.InfoContext(context.Background(), "starting queue worker", slog.Int("concurrency", concurrency))
	return server.Run(s.mux)
}

// Close closes the queue client connection.
func (s *Service) Close() error {
	return s.client.Close()
}

func buildAsynqOptions(opts *EnqueueOpts) []asynq.Option {
	var asynqOpts []asynq.Option

	if opts.maxRetry != nil {
		asynqOpts = append(asynqOpts, asynq.MaxRetry(*opts.maxRetry))
	}
	if opts.timeout != nil {
		asynqOpts = append(asynqOpts, asynq.Timeout(*opts.timeout))
	}
	if opts.deadline != nil {
		asynqOpts = append(asynqOpts, asynq.Deadline(*opts.deadline))
	}
	if opts.uniqueDuration != nil {
		asynqOpts = append(asynqOpts, asynq.Unique(*opts.uniqueDuration))
	}
	if opts.queue != nil {
		asynqOpts = append(asynqOpts, asynq.Queue(*opts.queue))
	}
	if opts.processAt != nil {
		asynqOpts = append(asynqOpts, asynq.ProcessAt(*opts.processAt))
	}
	if opts.processIn != nil {
		asynqOpts = append(asynqOpts, asynq.ProcessIn(*opts.processIn))
	}
	if opts.retention != nil {
		asynqOpts = append(asynqOpts, asynq.Retention(*opts.retention))
	}

	return asynqOpts
}

// asynqLogger adapts slog.Logger to asynq.Logger interface.
type asynqLogger struct {
	logger *slog.Logger
}

func newAsynqLogger(logger *slog.Logger) *asynqLogger {
	return &asynqLogger{logger: logger}
}

func (l *asynqLogger) Debug(args ...any) {
	l.logger.DebugContext(context.Background(), fmt.Sprint(args...))
}

func (l *asynqLogger) Info(args ...any) {
	l.logger.InfoContext(context.Background(), fmt.Sprint(args...))
}

func (l *asynqLogger) Warn(args ...any) {
	l.logger.WarnContext(context.Background(), fmt.Sprint(args...))
}

func (l *asynqLogger) Error(args ...any) {
	l.logger.ErrorContext(context.Background(), fmt.Sprint(args...))
}

func (l *asynqLogger) Fatal(args ...any) {
	l.logger.ErrorContext(context.Background(), fmt.Sprint(args...))
}
