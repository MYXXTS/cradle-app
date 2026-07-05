package token

import (
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"testing"
	"time"
)

func TestAssertionValidator(t *testing.T) {
	now := time.Unix(1780000000, 0)
	_, privateKey, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}
	validator := NewAssertionValidator(AssertionValidatorConfig{
		Now:     func() time.Time { return now },
		MaxSkew: time.Minute,
	})
	signed := signTestAssertion(t, privateKey, Assertion{
		Pubkey:   base64.StdEncoding.EncodeToString(privateKey.Public().(ed25519.PublicKey)),
		Role:     RoleHost,
		RoomID:   "room_1",
		Purpose:  PurposeWebSocket,
		IssuedAt: now.Unix(),
		Nonce:    "nonce_1",
	})

	assertion, err := validator.Validate(t.Context(), signed, ExpectedAssertion{
		Role:    RoleHost,
		RoomID:  "room_1",
		Purpose: PurposeWebSocket,
	})
	if err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
	if assertion.RoomID != "room_1" {
		t.Fatalf("assertion.RoomID = %q, expected room_1", assertion.RoomID)
	}
}

func TestAssertionValidatorRejectsStaleAssertion(t *testing.T) {
	now := time.Unix(1780000000, 0)
	_, privateKey, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}
	validator := NewAssertionValidator(AssertionValidatorConfig{
		Now:     func() time.Time { return now },
		MaxSkew: time.Minute,
	})
	signed := signTestAssertion(t, privateKey, Assertion{
		Pubkey:   base64.StdEncoding.EncodeToString(privateKey.Public().(ed25519.PublicKey)),
		Role:     RoleHost,
		RoomID:   "room_1",
		Purpose:  PurposeWebSocket,
		IssuedAt: now.Add(-2 * time.Minute).Unix(),
		Nonce:    "nonce_1",
	})

	_, err = validator.Validate(t.Context(), signed, ExpectedAssertion{
		Role:    RoleHost,
		RoomID:  "room_1",
		Purpose: PurposeWebSocket,
	})
	if !errors.Is(err, ErrStaleAssertion) {
		t.Fatalf("Validate() error = %v, expected ErrStaleAssertion", err)
	}
}

func TestAssertionValidatorRejectsReplay(t *testing.T) {
	now := time.Unix(1780000000, 0)
	_, privateKey, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}
	validator := NewAssertionValidator(AssertionValidatorConfig{
		Now:     func() time.Time { return now },
		MaxSkew: time.Minute,
	})
	signed := signTestAssertion(t, privateKey, Assertion{
		Pubkey:   base64.StdEncoding.EncodeToString(privateKey.Public().(ed25519.PublicKey)),
		Role:     RoleHost,
		RoomID:   "room_1",
		Purpose:  PurposeWebSocket,
		IssuedAt: now.Unix(),
		Nonce:    "nonce_1",
	})

	if _, err := validator.Validate(t.Context(), signed, ExpectedAssertion{}); err != nil {
		t.Fatalf("first Validate() error = %v", err)
	}
	_, err = validator.Validate(t.Context(), signed, ExpectedAssertion{})
	if !errors.Is(err, ErrReplayedNonce) {
		t.Fatalf("second Validate() error = %v, expected ErrReplayedNonce", err)
	}
}

func TestAssertionValidatorRejectsTamperedAssertion(t *testing.T) {
	now := time.Unix(1780000000, 0)
	_, privateKey, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}
	validator := NewAssertionValidator(AssertionValidatorConfig{
		Now:     func() time.Time { return now },
		MaxSkew: time.Minute,
	})
	signed := signTestAssertion(t, privateKey, Assertion{
		Pubkey:   base64.StdEncoding.EncodeToString(privateKey.Public().(ed25519.PublicKey)),
		Role:     RoleHost,
		RoomID:   "room_1",
		Purpose:  PurposeWebSocket,
		IssuedAt: now.Unix(),
		Nonce:    "nonce_1",
	})
	signed.Assertion.RoomID = "room_2"

	_, err = validator.Validate(t.Context(), signed, ExpectedAssertion{})
	if !errors.Is(err, ErrInvalidAssertion) {
		t.Fatalf("Validate() error = %v, expected ErrInvalidAssertion", err)
	}
}

func signTestAssertion(t *testing.T, privateKey ed25519.PrivateKey, assertion Assertion) SignedAssertion {
	t.Helper()
	payload, err := CanonicalJSON(assertion)
	if err != nil {
		t.Fatalf("CanonicalJSON() error = %v", err)
	}
	return SignedAssertion{
		Assertion: assertion,
		Signature: base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, payload)),
	}
}
