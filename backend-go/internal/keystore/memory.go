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

func (m memoryItem) isExpired() bool {
	return !m.expiresAt.IsZero() && time.Now().After(m.expiresAt)
}

// MemoryKeyStore is an in-memory implementation of KeyStore for testing.
type MemoryKeyStore struct {
	mu    sync.RWMutex
	items map[string]memoryItem
}

// NewMemoryKeyStore creates a new in-memory keystore.
func NewMemoryKeyStore() *MemoryKeyStore {
	return &MemoryKeyStore{
		items: make(map[string]memoryItem),
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
	item, ok := m.items[key]
	if !ok {
		return false, nil
	}
	item.expiresAt = time.Now().Add(expiry)
	m.items[key] = item
	return true, nil
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

func (m *MemoryKeyStore) StreamAdd(_ context.Context, stream, id string, values map[string]string) (string, error) {
	// Simplified implementation - just return a fake ID
	return "0-0", nil
}

func intToString(n int64) string {
	return strconv.FormatInt(n, 10)
}

func stringToInt(s string) int64 {
	if s == "" {
		return 0
	}
	// Parse as integer string
	var result int64
	negative := false
	start := 0
	if s[0] == '-' {
		negative = true
		start = 1
	}
	for i := start; i < len(s); i++ {
		if s[i] >= '0' && s[i] <= '9' {
			result = result*10 + int64(s[i]-'0')
		}
	}
	if negative {
		return -result
	}
	return result
}
