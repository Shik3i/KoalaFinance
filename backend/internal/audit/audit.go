package audit

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Shik3i/KoalaFinance/backend/internal/db"
)

// Allowed Event Types
const (
	EventUserRegister     = "user_register"
	EventUserLoginSuccess = "user_login_success"
	EventUserLoginFailure = "user_login_failure"
	EventUserLogout       = "user_logout"
	EventPasswordReset    = "password_reset"
	EventRegToggle        = "reg_toggle"
)

var allowedEvents = map[string]bool{
	EventUserRegister:     true,
	EventUserLoginSuccess: true,
	EventUserLoginFailure: true,
	EventUserLogout:       true,
	EventPasswordReset:    true,
	EventRegToggle:        true,
}

// AuditDetails is the strict allowlisted structure for audit event details.
// It is structurally impossible to log arbitrary free-form strings.
type AuditDetails struct {
	UserID       *string `json:"user_id,omitempty"`
	TargetUserID *string `json:"target_user_id,omitempty"`
	ActorUserID  *string `json:"actor_user_id,omitempty"`
	Setting      string  `json:"setting,omitempty"`
	Enabled      *bool   `json:"enabled,omitempty"`
	ReasonCode   string  `json:"reason_code,omitempty"`
	Status       string  `json:"status,omitempty"`
	Method       string  `json:"method,omitempty"`
	PathTemplate string  `json:"path_template,omitempty"`
	Role         string  `json:"role,omitempty"`
	VaultID      *string `json:"vault_id,omitempty"`
}

// GenerateRandomHex generates a secure random hex string
func GenerateRandomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// LogSecurityEvent writes a structured technical event to the database
func LogSecurityEvent(dbConn *db.DB, eventType string, details AuditDetails, ipAddress string) error {
	if !allowedEvents[eventType] {
		return fmt.Errorf("invalid security event type: %s", eventType)
	}

	// Serialize allowlist struct to JSON
	jsonBytes, err := json.Marshal(details)
	if err != nil {
		return fmt.Errorf("failed to marshal audit details: %w", err)
	}
	jsonString := string(jsonBytes)

	id := GenerateRandomHex(16)
	now := time.Now().UTC().Format(time.RFC3339)

	_, err = dbConn.SQL.Exec(`
		INSERT INTO security_events (id, event_type, user_id, details, ip_address, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, id, eventType, details.UserID, jsonString, ipAddress, now)

	return err
}
