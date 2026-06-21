package keystore

import (
	"context"
	"strconv"
	"sync"
	"time"
)

// memoryItem holds a value and its optional expiration time.
type memoryItem struct {
	value     string
	expiresAt time.Time
}

// memoryHash holds hash field-value pairs for HGET/HSET operations.
type memoryHash struct {
	fields    map[string]string
	expiresAt time.Time
}

func (m memoryItem) isExpired() bool {
	return !m.expiresAt.IsZero() && time.Now().After(m.expiresAt)
}

// MemoryKeyStore is an in-memory implementation of KeyStore for testing.
type MemoryKeyStore struct {
	mu     sync.RWMutex
	items  map[string]memoryItem
	hashes map[string]*memoryHash
}

// NewMemoryKeyStore creates a new in-memory keystore.
func NewMemoryKeyStore() *MemoryKeyStore {
	return &MemoryKeyStore{
		items:  make(map[string]memoryItem),
		hashes: make(map[string]*memoryHash),
	}
}

func (m *MemoryKeyStore) SetItem(_ context.Context, key, value string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.items[key] = memoryItem{value: value}
	return nil
}

func (m *MemoryKeyStore) GetItem(_ context.Context, key string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	item, ok := m.items[key]
	if !ok || item.isExpired() {
		return "", nil
	}
	return item.value, nil
}

func (m *MemoryKeyStore) SetExpiry(_ context.Context, key string, expiry time.Duration) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check regular items first
	if item, ok := m.items[key]; ok {
		item.expiresAt = time.Now().Add(expiry)
		m.items[key] = item
		return true, nil
	}

	// Check hashes
	if hash, ok := m.hashes[key]; ok {
		hash.expiresAt = time.Now().Add(expiry)
		return true, nil
	}

	return false, nil
}

func (m *MemoryKeyStore) SetItemWithExpiry(_ context.Context, key string, expiry time.Duration, value string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.items[key] = memoryItem{
		value:     value,
		expiresAt: time.Now().Add(expiry),
	}
	return nil
}

func (m *MemoryKeyStore) SetItemWithExpiryNX(_ context.Context, key string, expiry time.Duration, value string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if item, ok := m.items[key]; ok && !item.isExpired() {
		return false, nil
	}
	m.items[key] = memoryItem{
		value:     value,
		expiresAt: time.Now().Add(expiry),
	}
	return true, nil
}

func (m *MemoryKeyStore) DeleteItem(_ context.Context, key string) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.items[key]; ok {
		delete(m.items, key)
		return 1, nil
	}
	return 0, nil
}

func (m *MemoryKeyStore) DeleteItems(_ context.Context, keys []string) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var count int64
	for _, key := range keys {
		if _, ok := m.items[key]; ok {
			delete(m.items, key)
			count++
		}
	}
	return count, nil
}

func (m *MemoryKeyStore) IncrementBy(_ context.Context, key string, value int64) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	item, ok := m.items[key]
	if !ok || item.isExpired() {
		// Key doesn't exist, start from 0
		m.items[key] = memoryItem{value: intToString(value)}
		return value, nil
	}

	current := stringToInt(item.value)
	newValue := current + value
	item.value = intToString(newValue)
	m.items[key] = item
	return newValue, nil
}

func (m *MemoryKeyStore) IncrementByWithExpiry(_ context.Context, key string, value int64, expiry time.Duration) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	item, ok := m.items[key]
	if !ok || item.isExpired() {
		m.items[key] = memoryItem{
			value:     intToString(value),
			expiresAt: time.Now().Add(expiry),
		}
		return value, nil
	}

	current := stringToInt(item.value)
	newValue := current + value
	item.value = intToString(newValue)
	item.expiresAt = time.Now().Add(expiry)
	m.items[key] = item
	return newValue, nil
}

func (m *MemoryKeyStore) HashGet(_ context.Context, key, field string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	hash, ok := m.hashes[key]
	if !ok || (!hash.expiresAt.IsZero() && time.Now().After(hash.expiresAt)) {
		return "", nil
	}
	return hash.fields[field], nil
}

func (m *MemoryKeyStore) HashSet(_ context.Context, key, field, value string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	hash, ok := m.hashes[key]
	if !ok {
		hash = &memoryHash{fields: make(map[string]string)}
		m.hashes[key] = hash
	}
	hash.fields[field] = value
	return nil
}

func (m *MemoryKeyStore) StreamAdd(_ context.Context, stream, id string, values map[string]string) (string, error) {
	// Simplified implementation - just return a fake ID
	return "0-0", nil
}

func (m *MemoryKeyStore) PgGetIntItem(_ context.Context, key string) (int64, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	item, ok := m.items[key]
	if !ok || item.isExpired() {
		return 0, nil
	}
	return stringToInt(item.value), nil
}

func intToString(n int64) string {
	return strconv.FormatInt(n, 10)
}

func stringToInt(s string) int64 {
	if s == "" {
		return 0
	}
	result, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return 0
	}
	return result
}
