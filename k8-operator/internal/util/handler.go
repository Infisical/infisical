package util

import (
	"context"
	"math/rand"
	"time"

	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/util/workqueue"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/event"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"
)

// computeMaxJitterDuration returns a random duration between 0 and max.
// This is useful for introducing jitter to event processing.
func computeMaxJitterDuration(max time.Duration) (time.Duration, time.Duration) {
	if max <= 0 {
		return 0, 0
	}
	jitter := time.Duration(rand.Int63n(int64(max)))
	return max, jitter
}

// EnqueueDelayedEventHandler enqueues reconcile requests with a random delay (jitter)
// to spread the load and avoid thundering herd issues.
type EnqueueDelayedEventHandler struct {
	Delay time.Duration
}

func (e *EnqueueDelayedEventHandler) Create(_ context.Context, _ event.TypedCreateEvent[client.Object], _ workqueue.TypedRateLimitingInterface[reconcile.Request]) {
}

func (e *EnqueueDelayedEventHandler) Update(_ context.Context, _ event.TypedUpdateEvent[client.Object], _ workqueue.TypedRateLimitingInterface[reconcile.Request]) {
}

func (e *EnqueueDelayedEventHandler) Delete(_ context.Context, _ event.TypedDeleteEvent[client.Object], _ workqueue.TypedRateLimitingInterface[reconcile.Request]) {
}

func (e *EnqueueDelayedEventHandler) Generic(_ context.Context, evt event.TypedGenericEvent[client.Object], q workqueue.TypedRateLimitingInterface[reconcile.Request]) {
	if evt.Object == nil {
		return
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{
			Namespace: evt.Object.GetNamespace(),
			Name:      evt.Object.GetName(),
		},
	}

	_, delay := computeMaxJitterDuration(e.Delay)

	if delay > 0 {
		q.AddAfter(req, delay)
	} else {
		q.Add(req)
	}
}
