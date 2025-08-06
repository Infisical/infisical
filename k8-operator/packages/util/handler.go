package util

import (
	"fmt"
	"math/rand"
	"time"

	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/util/workqueue"
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

func (e *EnqueueDelayedEventHandler) Create(_ event.CreateEvent, _ workqueue.RateLimitingInterface) {
}

func (e *EnqueueDelayedEventHandler) Update(_ event.UpdateEvent, _ workqueue.RateLimitingInterface) {
}

func (e *EnqueueDelayedEventHandler) Delete(_ event.DeleteEvent, _ workqueue.RateLimitingInterface) {
}

func (e *EnqueueDelayedEventHandler) Generic(evt event.GenericEvent, q workqueue.RateLimitingInterface) {
	fmt.Println(evt)
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
