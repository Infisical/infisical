package azureadcs

import (
	"bytes"
	"crypto/hmac"
	"crypto/md5"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"strings"
	"unicode/utf16"

	//lint:ignore SA1019 NTLM's NT hash is MD4 by definition.
	"golang.org/x/crypto/md4"
)

const (
	ntlmSignature = "NTLMSSP\x00"

	flagUnicode       = 0x00000001
	flagRequestTarget = 0x00000004
	flagNTLM          = 0x00000200
	flagAlwaysSign    = 0x00008000
	flagTargetDomain  = 0x00010000
	flagNTLM2Key      = 0x00080000
	flagTargetInfo    = 0x00800000

	// netbiosDomain is the domain the server names in its challenge.
	netbiosDomain = "HARNESS"
)

// challengeMessage is the NTLM type 2 message offering serverChallenge, asking for
// NTLMv2 (NTLM2 key and target info) in Unicode.
func challengeMessage(serverChallenge []byte) string {
	target := utf16le(netbiosDomain)
	var info bytes.Buffer
	for _, av := range []struct {
		id    uint16
		value string
	}{{2, netbiosDomain}, {1, "ADCS"}} {
		v := utf16le(av.value)
		_ = binary.Write(&info, binary.LittleEndian, av.id)
		_ = binary.Write(&info, binary.LittleEndian, uint16(len(v)))
		info.Write(v)
	}
	info.Write([]byte{0, 0, 0, 0})

	const headerLen = 48
	msg := make([]byte, headerLen, headerLen+len(target)+info.Len())
	copy(msg, ntlmSignature)
	binary.LittleEndian.PutUint32(msg[8:], 2)
	putSecurityBuffer(msg[12:], len(target), headerLen)
	binary.LittleEndian.PutUint32(msg[20:], flagUnicode|flagRequestTarget|flagNTLM|flagAlwaysSign|flagTargetDomain|flagNTLM2Key|flagTargetInfo)
	copy(msg[24:32], serverChallenge)
	putSecurityBuffer(msg[40:], info.Len(), headerLen+len(target))
	msg = append(msg, target...)
	msg = append(msg, info.Bytes()...)
	return "NTLM " + base64.StdEncoding.EncodeToString(msg)
}

// authenticate is a parsed NTLM type 3 message.
type authenticate struct {
	user, domain string
	ntResponse   []byte
}

// messageType reads an NTLM message from an Authorization header, answering its type.
func messageType(header string) (int, []byte, error) {
	raw, ok := strings.CutPrefix(header, "NTLM ")
	if !ok {
		return 0, nil, errors.New("not an NTLM authorization")
	}
	msg, err := base64.StdEncoding.DecodeString(strings.TrimSpace(raw))
	if err != nil || len(msg) < 12 || string(msg[:8]) != ntlmSignature {
		return 0, nil, errors.New("malformed NTLM message")
	}
	return int(binary.LittleEndian.Uint32(msg[8:])), msg, nil
}

func parseAuthenticate(msg []byte) (authenticate, error) {
	if len(msg) < 52 {
		return authenticate{}, errors.New("short type 3 message")
	}
	field := func(at int) ([]byte, error) {
		l := int(binary.LittleEndian.Uint16(msg[at:]))
		off := int(binary.LittleEndian.Uint32(msg[at+4:]))
		if off+l > len(msg) {
			return nil, errors.New("type 3 field out of range")
		}
		return msg[off : off+l], nil
	}
	nt, err := field(20)
	if err != nil {
		return authenticate{}, err
	}
	domain, err := field(28)
	if err != nil {
		return authenticate{}, err
	}
	user, err := field(36)
	if err != nil {
		return authenticate{}, err
	}
	return authenticate{user: fromUTF16le(user), domain: fromUTF16le(domain), ntResponse: nt}, nil
}

// verifyNTLMv2 checks the NTProofStr of an NTLMv2 response against the password.
func verifyNTLMv2(a authenticate, password string, serverChallenge []byte) bool {
	if len(a.ntResponse) <= 16 {
		return false
	}
	h := md4.New()
	h.Write(utf16le(password))
	v2 := hmac.New(md5.New, h.Sum(nil))
	v2.Write(utf16le(strings.ToUpper(a.user) + a.domain))
	proof := hmac.New(md5.New, v2.Sum(nil))
	proof.Write(serverChallenge)
	proof.Write(a.ntResponse[16:])
	return hmac.Equal(proof.Sum(nil), a.ntResponse[:16])
}

func putSecurityBuffer(b []byte, length, offset int) {
	binary.LittleEndian.PutUint16(b, uint16(length))
	binary.LittleEndian.PutUint16(b[2:], uint16(length))
	binary.LittleEndian.PutUint32(b[4:], uint32(offset))
}

func utf16le(s string) []byte {
	units := utf16.Encode([]rune(s))
	out := make([]byte, 2*len(units))
	for i, u := range units {
		binary.LittleEndian.PutUint16(out[2*i:], u)
	}
	return out
}

func fromUTF16le(b []byte) string {
	units := make([]uint16, len(b)/2)
	for i := range units {
		units[i] = binary.LittleEndian.Uint16(b[2*i:])
	}
	return string(utf16.Decode(units))
}

func newChallenge() []byte {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return b
}
