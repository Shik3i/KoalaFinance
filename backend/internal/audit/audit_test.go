package audit

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/Shik3i/KoalaFinance/backend/internal/db"
)

func setupTestDB(t *testing.T) *db.DB {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_audit.db")
	t.Setenv("KOALAFINANCE_DATABASE_PATH", dbPath)

	database, err := db.Connect()
	if err != nil {
		t.Fatalf("failed to connect to test db: %v", err)
	}
	return database
}

func TestAuditLogValidation(t *testing.T) {
	database := setupTestDB(t)
	defer database.SQL.Close()

	// Insert mock user to satisfy foreign key constraint
	_, err := database.SQL.Exec(`
		INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
		VALUES ('user_123', 'test@local', 'hash', 'user', 'active', 'now', 'now')
	`)
	if err != nil {
		t.Fatalf("Failed to insert mock user: %v", err)
	}

	// 1. Log a valid Event
	uID := "user_123"
	details := AuditDetails{
		UserID:     &uID,
		Status:     "success",
		ReasonCode: "valid_credentials",
	}

	err = LogSecurityEvent(database, EventUserLoginSuccess, details, "127.0.0.1")
	if err != nil {
		t.Errorf("Expected LogSecurityEvent to succeed, got: %v", err)
	}

	// Verify database record
	var dbDetails string
	err = database.SQL.QueryRow("SELECT details FROM security_events LIMIT 1").Scan(&dbDetails)
	if err != nil {
		t.Fatalf("Failed to query security events: %v", err)
	}

	// Assert the details is a valid JSON matching the structure
	var parsedDetails AuditDetails
	err = json.Unmarshal([]byte(dbDetails), &parsedDetails)
	if err != nil {
		t.Fatalf("Stored details was not valid JSON: %v", err)
	}

	if *parsedDetails.UserID != uID {
		t.Errorf("Expected UserID %s, got %s", uID, *parsedDetails.UserID)
	}
	if parsedDetails.Status != "success" {
		t.Errorf("Expected Status success, got %s", parsedDetails.Status)
	}

	// 2. Reject invalid event type
	err = LogSecurityEvent(database, "invalid_event_type", AuditDetails{}, "127.0.0.1")
	if err == nil {
		t.Error("Expected LogSecurityEvent to fail for invalid event type, but it succeeded")
	}
}
