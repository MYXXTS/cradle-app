package pairing

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestStoreStartClaimOnce(t *testing.T) {
	now := time.Unix(1780000000, 0)
	store := NewStore(StoreConfig{
		CodeTTL: time.Minute,
		Now:     func() time.Time { return now },
	})

	started, err := store.Start(t.Context(), StartInput{
		RoomID:     "room_1",
		HostPubkey: "host_pubkey",
	})
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if started.PairingCode == "" {
		t.Fatal("Start() returned empty pairing code")
	}

	compactCode := strings.ReplaceAll(started.PairingCode, "-", "")
	claimed, err := store.Claim(context.Background(), ClaimInput{
		Code:             compactCode,
		RoomID:           "room_1",
		ControllerPubkey: "controller_pubkey",
	})
	if err != nil {
		t.Fatalf("Claim() error = %v", err)
	}
	if claimed.RoomID != "room_1" {
		t.Fatalf("claimed.RoomID = %q, expected room_1", claimed.RoomID)
	}

	_, err = store.Claim(context.Background(), ClaimInput{
		Code:             compactCode,
		RoomID:           "room_1",
		ControllerPubkey: "controller_pubkey",
	})
	if !errors.Is(err, ErrAlreadyClaimed) {
		t.Fatalf("second Claim() error = %v, expected ErrAlreadyClaimed", err)
	}
}

func TestStoreExpiresPairing(t *testing.T) {
	now := time.Unix(1780000000, 0)
	store := NewStore(StoreConfig{
		CodeTTL: time.Minute,
		Now:     func() time.Time { return now },
	})

	started, err := store.Start(t.Context(), StartInput{
		RoomID:     "room_1",
		HostPubkey: "host_pubkey",
	})
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	removed := store.Expire(t.Context(), now.Add(time.Minute))
	if removed != 1 {
		t.Fatalf("Expire() = %d, expected 1", removed)
	}

	_, err = store.Claim(t.Context(), ClaimInput{
		Code:             started.PairingCode,
		RoomID:           "room_1",
		ControllerPubkey: "controller_pubkey",
	})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("Claim() error = %v, expected ErrNotFound", err)
	}
}
