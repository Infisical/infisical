package keyringwrapper

import (
	"time"

	"github.com/zalando/go-keyring"
)

const MAIN_KEYRING_SERVICE = "infisical-cli"

type TimeoutError struct {
	message string
}

func (e *TimeoutError) Error() string {
	return e.message
}

func Set(key, value string) error {
	ch := make(chan error, 1)
	go func() {
		defer close(ch)
		ch <- keyring.Set(MAIN_KEYRING_SERVICE, key, value)
	}()
	select {
	case err := <-ch:
		return err
	case <-time.After(3 * time.Second):
		return &TimeoutError{"timeout while trying to set secret in keyring"}
	}
}

func Get(key string) (string, error) {
	ch := make(chan struct {
		val string
		err error
	}, 1)

	go func() {
		defer close(ch)
		val, err := keyring.Get(MAIN_KEYRING_SERVICE, key)
		ch <- struct {
			val string
			err error
		}{val, err}
	}()

	select {
	case res := <-ch:
		return res.val, res.err
	case <-time.After(3 * time.Second):
		return "", &TimeoutError{"timeout while trying to get secret from keyring"}
	}
}

func Delete(key string) error {
	ch := make(chan error, 1)
	go func() {
		defer close(ch)
		ch <- keyring.Delete(MAIN_KEYRING_SERVICE, key)
	}()
	select {
	case err := <-ch:
		return err
	case <-time.After(3 * time.Second):
		return &TimeoutError{"timeout while trying to delete secret from keyring"}
	}
}
