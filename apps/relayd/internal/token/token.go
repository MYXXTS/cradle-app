package token

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"
)

const (
	RoleHost       Role = "host"
	RoleController Role = "controller"

	PurposeCreateRoom Purpose = "create_room"
	PurposeClaim      Purpose = "claim"
	PurposeReconnect  Purpose = "reconnect"
	PurposeWebSocket  Purpose = "ws"
)

var (
	ErrInvalidAssertion = errors.New("token: invalid assertion")
	ErrStaleAssertion   = errors.New("token: stale assertion")
	ErrReplayedNonce    = errors.New("token: replayed nonce")
)

type Role string

type Purpose string

type Assertion struct {
	Pubkey           string  `json:"pubkey"`
	Role             Role    `json:"role"`
	RoomID           string  `json:"roomId"`
	Purpose          Purpose `json:"purpose"`
	PairingCode      string  `json:"pairingCode,omitempty"`
	ControllerPubkey string  `json:"controllerPubkey,omitempty"`
	IssuedAt         int64   `json:"issuedAt"`
	Nonce            string  `json:"nonce"`
}

type SignedAssertion struct {
	Assertion Assertion `json:"assertion"`
	Signature string    `json:"signature"`
}

type ExpectedAssertion struct {
	Role    Role
	RoomID  string
	Purpose Purpose
}

type Validator interface {
	Validate(ctx context.Context, signed SignedAssertion, expected ExpectedAssertion) (Assertion, error)
}

type AssertionValidatorConfig struct {
	Now      func() time.Time
	MaxSkew  time.Duration
	NonceTTL time.Duration
}

type AssertionValidator struct {
	now      func() time.Time
	maxSkew  time.Duration
	nonceTTL time.Duration

	mu     sync.Mutex
	nonces map[string]time.Time
}

func NewAssertionValidator(cfg AssertionValidatorConfig) *AssertionValidator {
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	maxSkew := cfg.MaxSkew
	if maxSkew <= 0 {
		maxSkew = time.Minute
	}
	nonceTTL := cfg.NonceTTL
	if nonceTTL <= 0 {
		nonceTTL = 2 * maxSkew
	}
	return &AssertionValidator{
		now:      now,
		maxSkew:  maxSkew,
		nonceTTL: nonceTTL,
		nonces:   map[string]time.Time{},
	}
}

func (v *AssertionValidator) Validate(_ context.Context, signed SignedAssertion, expected ExpectedAssertion) (Assertion, error) {
	assertion := signed.Assertion
	if err := validateRequired(assertion); err != nil {
		return Assertion{}, err
	}
	if expected.Role != "" && assertion.Role != expected.Role {
		return Assertion{}, ErrInvalidAssertion
	}
	if expected.RoomID != "" && assertion.RoomID != expected.RoomID {
		return Assertion{}, ErrInvalidAssertion
	}
	if expected.Purpose != "" && assertion.Purpose != expected.Purpose {
		return Assertion{}, ErrInvalidAssertion
	}
	publicKey, err := base64.StdEncoding.DecodeString(assertion.Pubkey)
	if err != nil || len(publicKey) != ed25519.PublicKeySize {
		return Assertion{}, ErrInvalidAssertion
	}
	signature, err := base64.StdEncoding.DecodeString(strings.TrimSpace(signed.Signature))
	if err != nil || len(signature) != ed25519.SignatureSize {
		return Assertion{}, ErrInvalidAssertion
	}
	payload, err := CanonicalJSON(assertion)
	if err != nil {
		return Assertion{}, ErrInvalidAssertion
	}
	if !ed25519.Verify(ed25519.PublicKey(publicKey), payload, signature) {
		return Assertion{}, ErrInvalidAssertion
	}
	now := v.now()
	issuedAt := time.Unix(assertion.IssuedAt, 0)
	if issuedAt.Before(now.Add(-v.maxSkew)) || issuedAt.After(now.Add(v.maxSkew)) {
		return Assertion{}, ErrStaleAssertion
	}
	if err := v.rememberNonce(assertion, now); err != nil {
		return Assertion{}, err
	}
	return assertion, nil
}

func validateRequired(assertion Assertion) error {
	if strings.TrimSpace(assertion.Pubkey) == "" ||
		strings.TrimSpace(assertion.RoomID) == "" ||
		strings.TrimSpace(assertion.Nonce) == "" ||
		assertion.Role == "" ||
		assertion.Purpose == "" ||
		assertion.IssuedAt == 0 {
		return ErrInvalidAssertion
	}
	return nil
}

func (v *AssertionValidator) rememberNonce(assertion Assertion, now time.Time) error {
	key := assertion.Pubkey + ":" + assertion.Nonce
	v.mu.Lock()
	defer v.mu.Unlock()
	for nonce, expiresAt := range v.nonces {
		if !now.Before(expiresAt) {
			delete(v.nonces, nonce)
		}
	}
	if _, ok := v.nonces[key]; ok {
		return ErrReplayedNonce
	}
	v.nonces[key] = now.Add(v.nonceTTL)
	return nil
}

func CanonicalJSON(assertion Assertion) ([]byte, error) {
	fields := map[string]any{
		"issuedAt": assertion.IssuedAt,
		"nonce":    assertion.Nonce,
		"pubkey":   assertion.Pubkey,
		"purpose":  assertion.Purpose,
		"role":     assertion.Role,
		"roomId":   assertion.RoomID,
	}
	if assertion.PairingCode != "" {
		fields["pairingCode"] = assertion.PairingCode
	}
	if assertion.ControllerPubkey != "" {
		fields["controllerPubkey"] = assertion.ControllerPubkey
	}
	return json.Marshal(fields)
}

func SignedAssertionFromHeaders(assertionHeader string, signatureHeader string) (SignedAssertion, bool) {
	assertionHeader = strings.TrimSpace(assertionHeader)
	signatureHeader = strings.TrimSpace(signatureHeader)
	if assertionHeader == "" || signatureHeader == "" {
		return SignedAssertion{}, false
	}
	raw, err := base64.StdEncoding.DecodeString(assertionHeader)
	if err != nil {
		return SignedAssertion{}, false
	}
	var assertion Assertion
	if err := json.Unmarshal(raw, &assertion); err != nil {
		return SignedAssertion{}, false
	}
	return SignedAssertion{Assertion: assertion, Signature: signatureHeader}, true
}
