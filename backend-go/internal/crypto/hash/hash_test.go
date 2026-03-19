package hash_test

import (
	"encoding/hex"
	"testing"

	"github.com/infisical/api/internal/crypto/hash"
)

func TestSHA256Hex(t *testing.T) {
	// echo -n "hello" | sha256sum
	want := "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
	got := hash.SHA256Hex([]byte("hello"))
	if got != want {
		t.Fatalf("SHA256Hex(\"hello\") = %s, want %s", got, want)
	}
}

func TestSHA1Hex(t *testing.T) {
	// echo -n "hello" | sha1sum
	want := "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d"
	got := hash.SHA1Hex([]byte("hello"))
	if got != want {
		t.Fatalf("SHA1Hex(\"hello\") = %s, want %s", got, want)
	}
}

func TestHMACSHA256(t *testing.T) {
	key := []byte("secret")
	data := []byte("hello")
	got := hex.EncodeToString(hash.HMACSHA256(key, data))
	// python3 -c "import hmac,hashlib; print(hmac.new(b'secret',b'hello',hashlib.sha256).hexdigest())"
	want := "88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b"
	if got != want {
		t.Fatalf("HMACSHA256 = %s, want %s", got, want)
	}
}

func TestTimingSafeEqual(t *testing.T) {
	a := []byte("same")
	b := []byte("same")
	c := []byte("diff")
	d := []byte("longer")

	if !hash.TimingSafeEqual(a, b) {
		t.Fatal("expected equal slices to match")
	}
	if hash.TimingSafeEqual(a, c) {
		t.Fatal("expected different slices to not match")
	}
	if hash.TimingSafeEqual(a, d) {
		t.Fatal("expected different-length slices to not match")
	}
}

func TestNewHasher(t *testing.T) {
	for _, algo := range []string{"sha256", "sha384", "sha512", "sha1"} {
		h, err := hash.NewHasher(algo)
		if err != nil {
			t.Fatalf("NewHasher(%q): %v", algo, err)
		}
		h.Write([]byte("test"))
		if len(h.Sum(nil)) == 0 {
			t.Fatalf("NewHasher(%q) produced empty digest", algo)
		}
	}

	_, err := hash.NewHasher("md5")
	if err == nil {
		t.Fatal("expected error for unsupported algorithm")
	}
}

func TestNewHMAC(t *testing.T) {
	key := []byte("key")
	for _, algo := range []string{"sha256", "sha384", "sha512", "sha1"} {
		h, err := hash.NewHMAC(algo, key)
		if err != nil {
			t.Fatalf("NewHMAC(%q): %v", algo, err)
		}
		h.Write([]byte("test"))
		if len(h.Sum(nil)) == 0 {
			t.Fatalf("NewHMAC(%q) produced empty digest", algo)
		}
	}
}
