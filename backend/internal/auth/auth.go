package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Shik3i/KoalaFinance/backend/internal/audit"
	"github.com/Shik3i/KoalaFinance/backend/internal/db"
	"github.com/go-chi/chi/v5"
)

type User struct {
	ID                       string  `json:"id"`
	Username                 string  `json:"username"`
	Role                     string  `json:"role"`
	Status                   string  `json:"status"`
	PublicKey                *string `json:"public_key,omitempty"`
	EncryptedPrivateKey      *string `json:"encrypted_private_key,omitempty"`
	EncryptedPrivateKeyRecov *string `json:"encrypted_private_key_recovery,omitempty"`
	KDFParamsJSON            *string `json:"kdf_params_json,omitempty"`
	RecoveryKDFParamsJSON    *string `json:"recovery_kdf_params_json,omitempty"`
	CreatedAt                string  `json:"created_at"`
	UpdatedAt                string  `json:"updated_at"`
}

type AuthHandler struct {
	DB              *db.DB
	challengeSecret string
	dummyPubKey     *rsa.PublicKey
	dummyPrivKey    *rsa.PrivateKey
}

func NewAuthHandler(db *db.DB) *AuthHandler {
	dummyKey, err := rsa.GenerateKey(rand.Reader, 3072)
	if err != nil {
		log.Fatalf("Failed to generate dummy RSA key: %v", err)
	}
	return &AuthHandler{
		DB:              db,
		challengeSecret: GenerateRandomHex(32),
		dummyPubKey:     &dummyKey.PublicKey,
		dummyPrivKey:    dummyKey,
	}
}

// GenerateRandomHex generates a secure random hex string
func GenerateRandomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// HashSessionToken computes SHA-256 hash of a session token
func HashSessionToken(token string) string {
	h := sha256.New()
	h.Write([]byte(token))
	return hex.EncodeToString(h.Sum(nil))
}

// BootstrapAdmin creates the initial admin user if none exists in the DB
func BootstrapAdmin(dbConn *db.DB) {
	username := os.Getenv("KOALAFINANCE_ADMIN_USERNAME")
	password := os.Getenv("KOALAFINANCE_ADMIN_PASSWORD")

	var count int
	err := dbConn.SQL.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'admin'").Scan(&count)
	if err != nil {
		log.Fatalf("Admin bootstrap query failed: %v", err)
	}

	if count > 0 {
		log.Println("Admin user(s) already exist in database. Skipping admin bootstrap.")
		return
	}

	if username == "" || password == "" {
		log.Println("WARNING: No admin user exists, and KOALAFINANCE_ADMIN_USERNAME / KOALAFINANCE_ADMIN_PASSWORD env vars are missing!")
		log.Println("WARNING: Admin bootstrap aborted. You will not be able to manage the platform.")
		return
	}

	// Create initial admin
	id := GenerateRandomHex(16)
	hashedPass, err := HashPassword(password, DefaultArgon2Params)
	if err != nil {
		log.Fatalf("Failed to hash admin password: %v", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = dbConn.SQL.Exec(`
		INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
		VALUES (?, ?, ?, 'admin', 'active', ?, ?)
	`, id, username, hashedPass, now, now)

	if err != nil {
		log.Fatalf("Failed to insert admin user: %v", err)
	}

	log.Println("SUCCESS: Initial site admin user bootstrapped successfully from environment variables.")
}

// CheckRegistrationEnabled queries whether registration is allowed
func (h *AuthHandler) IsRegistrationEnabled() bool {
	var val string
	err := h.DB.SQL.QueryRow("SELECT value FROM app_settings WHERE key = 'registration_enabled'").Scan(&val)
	if err != nil {
		// Default to disabled
		return false
	}
	return val == "true"
}

func (h *AuthHandler) GetRegistrationStatus(w http.ResponseWriter, r *http.Request) {
	enabled := h.IsRegistrationEnabled()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"registration_enabled": enabled})
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if !h.IsRegistrationEnabled() {
		http.Error(w, `{"error":"Public registration is disabled"}`, http.StatusForbidden)
		return
	}

	var req struct {
		Username                    string `json:"username"`
		Password                    string `json:"password"`
		PublicKey                   string `json:"public_key"`
		EncryptedPrivateKey         string `json:"encrypted_private_key"`
		EncryptedPrivateKeyRecovery string `json:"encrypted_private_key_recovery"`
		KDFParamsJSON               string `json:"kdf_params_json"`
		RecoveryKDFParamsJSON       string `json:"recovery_kdf_params_json"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || len(req.Password) < 8 {
		http.Error(w, `{"error":"Username required, password must be at least 8 characters"}`, http.StatusBadRequest)
		return
	}

	// Validate username format (simple email/alphanumeric regex)
	matched, _ := regexp.MatchString(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9_]{3,30}$`, req.Username)
	if !matched {
		http.Error(w, `{"error":"Invalid username/email format"}`, http.StatusBadRequest)
		return
	}

	// Check if user already exists
	var exists bool
	err := h.DB.SQL.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE username = ?)", req.Username).Scan(&exists)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if exists {
		http.Error(w, `{"error":"Username already taken"}`, http.StatusConflict)
		return
	}

	// Hash password
	hashedPass, err := HashPassword(req.Password, DefaultArgon2Params)
	if err != nil {
		http.Error(w, `{"error":"Failed to hash password"}`, http.StatusInternalServerError)
		return
	}

	id := GenerateRandomHex(16)
	now := time.Now().UTC().Format(time.RFC3339)

	_, err = h.DB.SQL.Exec(`
		INSERT INTO users (id, username, password_hash, role, status, public_key, encrypted_private_key, encrypted_private_key_recovery, kdf_params_json, recovery_kdf_params_json, created_at, updated_at)
		VALUES (?, ?, ?, 'user', 'active', ?, ?, ?, ?, ?, ?, ?)
	`, id, req.Username, hashedPass, req.PublicKey, req.EncryptedPrivateKey, req.EncryptedPrivateKeyRecovery, req.KDFParamsJSON, req.RecoveryKDFParamsJSON, now, now)

	if err != nil {
		http.Error(w, `{"error":"Registration failed"}`, http.StatusInternalServerError)
		return
	}

	_ = audit.LogSecurityEvent(h.DB, audit.EventUserRegister, audit.AuditDetails{UserID: &id, Status: "success"}, r.RemoteAddr)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "User registered successfully", "id": id})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	var user User
	var hash string
	err := h.DB.SQL.QueryRow(`
		SELECT id, username, role, status, password_hash, public_key, encrypted_private_key, encrypted_private_key_recovery, kdf_params_json, recovery_kdf_params_json, created_at, updated_at
		FROM users WHERE username = ?
	`, req.Username).Scan(
		&user.ID, &user.Username, &user.Role, &user.Status, &hash,
		&user.PublicKey, &user.EncryptedPrivateKey, &user.EncryptedPrivateKeyRecov,
		&user.KDFParamsJSON, &user.RecoveryKDFParamsJSON, &user.CreatedAt, &user.UpdatedAt,
	)

	if err != nil {
		_ = audit.LogSecurityEvent(h.DB, audit.EventUserLoginFailure, audit.AuditDetails{ReasonCode: "username_not_found", Status: "failure"}, r.RemoteAddr)
		// Avoid timing attacks by performing a dummy verification if user is not found,
		// but simple message "Invalid username or password" is safe and standard.
		_, _ = VerifyPassword(req.Password, "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g")
		http.Error(w, `{"error":"Invalid username or password"}`, http.StatusUnauthorized)
		return
	}

	if user.Status == "disabled" {
		http.Error(w, `{"error":"User account is disabled"}`, http.StatusForbidden)
		return
	}

	ok, err := VerifyPassword(req.Password, hash)
	if err != nil || !ok {
		_ = audit.LogSecurityEvent(h.DB, audit.EventUserLoginFailure, audit.AuditDetails{UserID: &user.ID, ReasonCode: "password_mismatch", Status: "failure"}, r.RemoteAddr)
		http.Error(w, `{"error":"Invalid username or password"}`, http.StatusUnauthorized)
		return
	}

	// Create Session
	sessionToken := GenerateRandomHex(32)
	tokenHash := HashSessionToken(sessionToken)
	csrfSecret := GenerateRandomHex(32)
	sessionId := GenerateRandomHex(16)
	createdAt := time.Now().UTC()
	expiresAt := createdAt.Add(7 * 24 * time.Hour) // 7 days

	_, err = h.DB.SQL.Exec(`
		INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, csrf_secret)
		VALUES (?, ?, ?, ?, ?, ?)
	`, sessionId, user.ID, tokenHash, createdAt.Format(time.RFC3339), expiresAt.Format(time.RFC3339), csrfSecret)

	if err != nil {
		http.Error(w, `{"error":"Failed to establish session"}`, http.StatusInternalServerError)
		return
	}

	// Update last login
	_, _ = h.DB.SQL.Exec("UPDATE users SET last_login_at = ? WHERE id = ?", createdAt.Format(time.RFC3339), user.ID)

	// Set HttpOnly secure cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "koalafinance_session",
		Value:    sessionToken,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   false, // Set to true in prod (we can detect via env or origin if needed, but for MVP local tests false is standard unless HTTPS)
		SameSite: http.SameSiteLaxMode,
	})

	_ = audit.LogSecurityEvent(h.DB, audit.EventUserLoginSuccess, audit.AuditDetails{UserID: &user.ID, Status: "success"}, r.RemoteAddr)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user":       user,
		"csrf_token": csrfSecret,
	})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("koalafinance_session")
	if err != nil {
		http.Error(w, `{"error":"No active session"}`, http.StatusUnauthorized)
		return
	}

	// Fetch user ID for audit log before deleting session
	var uId string
	tokenHash := HashSessionToken(cookie.Value)
	_ = h.DB.SQL.QueryRow("SELECT user_id FROM sessions WHERE token_hash = ?", tokenHash).Scan(&uId)
	if uId != "" {
		_ = audit.LogSecurityEvent(h.DB, audit.EventUserLogout, audit.AuditDetails{UserID: &uId, Status: "success"}, r.RemoteAddr)
	}

	_, _ = h.DB.SQL.Exec("DELETE FROM sessions WHERE token_hash = ?", tokenHash)

	// Clear Cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "koalafinance_session",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Logged out successfully"})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*User)
	csrf, _ := r.Context().Value("csrf_secret").(string)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user":       user,
		"csrf_token": csrf,
	})
}

// User Context Middleware
func (h *AuthHandler) AuthenticateMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("koalafinance_session")
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		tokenHash := HashSessionToken(cookie.Value)
		var user User
		var expiresStr string
		var csrfSecret string

		err = h.DB.SQL.QueryRow(`
			SELECT u.id, u.username, u.role, u.status, u.public_key, u.encrypted_private_key, u.encrypted_private_key_recovery, u.kdf_params_json, u.recovery_kdf_params_json, u.created_at, u.updated_at, s.expires_at, s.csrf_secret
			FROM sessions s
			JOIN users u ON s.user_id = u.id
			WHERE s.token_hash = ? AND s.revoked_at IS NULL
		`, tokenHash).Scan(
			&user.ID, &user.Username, &user.Role, &user.Status,
			&user.PublicKey, &user.EncryptedPrivateKey, &user.EncryptedPrivateKeyRecov,
			&user.KDFParamsJSON, &user.RecoveryKDFParamsJSON, &user.CreatedAt, &user.UpdatedAt,
			&expiresStr, &csrfSecret,
		)

		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		expiresAt, err := time.Parse(time.RFC3339, expiresStr)
		if err != nil || time.Now().UTC().After(expiresAt) {
			// Session expired
			_, _ = h.DB.SQL.Exec("DELETE FROM sessions WHERE token_hash = ?", tokenHash)
			next.ServeHTTP(w, r)
			return
		}

		if user.Status == "disabled" {
			next.ServeHTTP(w, r)
			return
		}

		// Inject user and csrf secret into context
		ctx := r.Context()
		ctx = context.WithValue(ctx, "user", &user)
		ctx = context.WithValue(ctx, "csrf_secret", csrfSecret)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Site Admin Endpoint Handlers

func (h *AuthHandler) AdminGetStats(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*User)
	if !ok || user == nil || user.Role != "admin" {
		http.Error(w, `{"error":"Forbidden"}`, http.StatusForbidden)
		return
	}

	var userCount, vaultCount, recordCount int
	_ = h.DB.SQL.QueryRow("SELECT COUNT(*) FROM users").Scan(&userCount)
	_ = h.DB.SQL.QueryRow("SELECT COUNT(*) FROM vaults").Scan(&vaultCount)
	_ = h.DB.SQL.QueryRow("SELECT COUNT(*) FROM encrypted_records").Scan(&recordCount)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user_count":   userCount,
		"vault_count":  vaultCount,
		"record_count": recordCount,
		"app_version":  "0.1.0",
	})
}

func (h *AuthHandler) AdminGetUsers(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*User)
	if !ok || user == nil || user.Role != "admin" {
		http.Error(w, `{"error":"Forbidden"}`, http.StatusForbidden)
		return
	}

	rows, err := h.DB.SQL.Query("SELECT id, username, role, status, created_at, updated_at FROM users")
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &u.Status, &u.CreatedAt, &u.UpdatedAt); err == nil {
			users = append(users, u)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

func (h *AuthHandler) AdminToggleUser(w http.ResponseWriter, r *http.Request) {
	admin, ok := r.Context().Value("user").(*User)
	if !ok || admin == nil || admin.Role != "admin" {
		http.Error(w, `{"error":"Forbidden"}`, http.StatusForbidden)
		return
	}

	userId := chi.URLParam(r, "id")
	action := chi.URLParam(r, "action") // "enable" or "disable"

	if userId == admin.ID {
		http.Error(w, `{"error":"Cannot disable yourself"}`, http.StatusBadRequest)
		return
	}

	status := "active"
	if action == "disable" {
		status = "disabled"
	}

	now := time.Now().UTC().Format(time.RFC3339)
	res, err := h.DB.SQL.Exec("UPDATE users SET status = ?, updated_at = ? WHERE id = ?", status, now, userId)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	affected, _ := res.RowsAffected()
	if affected == 0 {
		http.Error(w, `{"error":"User not found"}`, http.StatusNotFound)
		return
	}

	// If disabled, revoke their sessions
	if status == "disabled" {
		_, _ = h.DB.SQL.Exec("DELETE FROM sessions WHERE user_id = ?", userId)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "User status updated successfully"})
}

func (h *AuthHandler) AdminResetUserPassword(w http.ResponseWriter, r *http.Request) {
	admin, ok := r.Context().Value("user").(*User)
	if !ok || admin == nil || admin.Role != "admin" {
		http.Error(w, `{"error":"Forbidden"}`, http.StatusForbidden)
		return
	}

	userId := chi.URLParam(r, "id")

	var req struct {
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.NewPassword) < 8 {
		http.Error(w, `{"error":"Password must be at least 8 characters"}`, http.StatusBadRequest)
		return
	}

	hashedPass, err := HashPassword(req.NewPassword, DefaultArgon2Params)
	if err != nil {
		http.Error(w, `{"error":"Failed to hash password"}`, http.StatusInternalServerError)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	// Resetting password sets status to "reset_required" so the user can log in but is forced to re-wrap their private key
	res, err := h.DB.SQL.Exec(`
		UPDATE users 
		SET password_hash = ?, status = 'reset_required', updated_at = ? 
		WHERE id = ?
	`, hashedPass, now, userId)

	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	affected, _ := res.RowsAffected()
	if affected == 0 {
		http.Error(w, `{"error":"User not found"}`, http.StatusNotFound)
		return
	}

	// Revoke sessions
	_, _ = h.DB.SQL.Exec("DELETE FROM sessions WHERE user_id = ?", userId)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "User password reset successfully. Reset state set."})
}

// Complete password re-wrap during login or after reset
func (h *AuthHandler) CompleteResetOrRewrap(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*User)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		PublicKey                   string `json:"public_key"`
		EncryptedPrivateKey         string `json:"encrypted_private_key"`
		EncryptedPrivateKeyRecovery string `json:"encrypted_private_key_recovery"`
		KDFParamsJSON               string `json:"kdf_params_json"`
		RecoveryKDFParamsJSON       string `json:"recovery_kdf_params_json"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err := h.DB.SQL.Exec(`
		UPDATE users 
		SET public_key = COALESCE(NULLIF(?, ''), public_key),
		    encrypted_private_key = ?, 
		    encrypted_private_key_recovery = ?, 
		    kdf_params_json = ?, 
		    recovery_kdf_params_json = ?, 
		    status = 'active',
		    updated_at = ?
		WHERE id = ?
	`, req.PublicKey, req.EncryptedPrivateKey, req.EncryptedPrivateKeyRecovery, req.KDFParamsJSON, req.RecoveryKDFParamsJSON, now, user.ID)

	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Private key rewrapped successfully"})
}

func (h *AuthHandler) AdminGetSettings(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*User)
	if !ok || user == nil || user.Role != "admin" {
		http.Error(w, `{"error":"Forbidden"}`, http.StatusForbidden)
		return
	}

	regEnabled := h.IsRegistrationEnabled()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"registration_enabled": regEnabled,
	})
}

func (h *AuthHandler) AdminSetRegistration(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*User)
	if !ok || user == nil || user.Role != "admin" {
		http.Error(w, `{"error":"Forbidden"}`, http.StatusForbidden)
		return
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	val := "false"
	if req.Enabled {
		val = "true"
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err := h.DB.SQL.Exec(`
		INSERT INTO app_settings (key, value, updated_at) 
		VALUES ('registration_enabled', ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	`, val, now)

	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	_ = audit.LogSecurityEvent(h.DB, audit.EventRegToggle, audit.AuditDetails{
		ActorUserID: &user.ID,
		Setting:     "registration_enabled",
		Enabled:     &req.Enabled,
		Status:      "success",
	}, r.RemoteAddr)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"registration_enabled": req.Enabled})
}

// Public key retrieval for another user (Required for Vault Sharing)
func (h *AuthHandler) GetUserPublicKey(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*User)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	targetUsername := chi.URLParam(r, "username")

	var targetId, pubKey string
	var status string
	err := h.DB.SQL.QueryRow("SELECT id, public_key, status FROM users WHERE username = ?", targetUsername).Scan(&targetId, &pubKey, &status)
	if err != nil || status == "disabled" || pubKey == "" {
		http.Error(w, `{"error":"User not found or has not generated encryption keys"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"id":         targetId,
		"username":   targetUsername,
		"public_key": pubKey,
	})
}

// ParseJWKPublicKey parses a public key from base64url-encoded JWK format
func ParseJWKPublicKey(jwkJSON []byte) (*rsa.PublicKey, error) {
	var jwk struct {
		Kty string `json:"kty"`
		N   string `json:"n"`
		E   string `json:"e"`
	}
	if err := json.Unmarshal(jwkJSON, &jwk); err != nil {
		return nil, err
	}
	if jwk.Kty != "RSA" {
		return nil, fmt.Errorf("unsupported key type: %s", jwk.Kty)
	}
	nBytes, err := base64.RawURLEncoding.DecodeString(jwk.N)
	if err != nil {
		return nil, fmt.Errorf("failed to decode modulus: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(jwk.E)
	if err != nil {
		return nil, fmt.Errorf("failed to decode exponent: %w", err)
	}
	nVal := new(big.Int).SetBytes(nBytes)
	var eVal int
	for _, b := range eBytes {
		eVal = (eVal << 8) | int(b)
	}
	return &rsa.PublicKey{
		N: nVal,
		E: eVal,
	}, nil
}

// RecoveryChallenge handles POST /api/auth/recovery-challenge with zero timing/status user enumeration leakage
func (h *AuthHandler) RecoveryChallenge(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}
	req.Username = strings.TrimSpace(req.Username)

	var id, encryptedPrivateKeyRecovery, recoveryKDFParams, publicKeyStr string
	var status string
	err := h.DB.SQL.QueryRow(`
		SELECT id, encrypted_private_key_recovery, recovery_kdf_params_json, public_key, status
		FROM users WHERE username = ?
	`, req.Username).Scan(&id, &encryptedPrivateKeyRecovery, &recoveryKDFParams, &publicKeyStr, &status)

	userExists := err == nil && status != "disabled" && encryptedPrivateKeyRecovery != "" && recoveryKDFParams != "" && publicKeyStr != ""

	var activePubKey *rsa.PublicKey
	var envPayload, kdfPayload string

	if userExists {
		pubKeyJSON, err := base64.StdEncoding.DecodeString(publicKeyStr)
		if err != nil {
			http.Error(w, `{"error":"Failed to parse user public key"}`, http.StatusInternalServerError)
			return
		}
		pubKey, err := ParseJWKPublicKey(pubKeyJSON)
		if err != nil {
			http.Error(w, `{"error":"Failed to decode user public key"}`, http.StatusInternalServerError)
			return
		}
		activePubKey = pubKey
		envPayload = encryptedPrivateKeyRecovery
		kdfPayload = recoveryKDFParams
	} else {
		activePubKey = h.dummyPubKey

		fakeSalt := GenerateRandomHex(16)
		fakeSaltB64 := base64.StdEncoding.EncodeToString([]byte(fakeSalt))

		fakeKdf := map[string]interface{}{
			"iterations": 600000,
			"salt":       fakeSaltB64,
		}
		fakeKdfJSON, _ := json.Marshal(fakeKdf)
		kdfPayload = string(fakeKdfJSON)

		fakeEnv := map[string]interface{}{
			"cryptoVersion": 1,
			"algorithm":     "AES-GCM-256",
			"kdf":           "PBKDF2-HMAC-SHA256",
			"kdfParams": map[string]interface{}{
				"iterations": 600000,
				"salt":       fakeSaltB64,
			},
			"nonce":   base64.StdEncoding.EncodeToString([]byte(GenerateRandomHex(6))),
			"payload": base64.StdEncoding.EncodeToString([]byte(GenerateRandomHex(128))),
		}
		fakeEnvJSON, _ := json.Marshal(fakeEnv)
		envPayload = string(fakeEnvJSON)
	}

	challengePlaintext := GenerateRandomHex(16)

	encryptedBytes, err := rsa.EncryptOAEP(
		sha256.New(),
		rand.Reader,
		activePubKey,
		[]byte(challengePlaintext),
		nil,
	)
	if err != nil {
		http.Error(w, `{"error":"Failed to encrypt challenge"}`, http.StatusInternalServerError)
		return
	}
	challengeCiphertextB64 := base64.StdEncoding.EncodeToString(encryptedBytes)

	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	payloadToSign := req.Username + ":" + challengePlaintext + ":" + timestamp
	mac := hmac.New(sha256.New, []byte(h.challengeSecret))
	mac.Write([]byte(payloadToSign))
	signature := hex.EncodeToString(mac.Sum(nil))

	tempToken := req.Username + ":" + timestamp + "." + signature

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"challenge":                      challengeCiphertextB64,
		"temp_token":                      tempToken,
		"encrypted_private_key_recovery": envPayload,
		"recovery_kdf_params_json":       kdfPayload,
	})
}

// RecoveryReset handles POST /api/auth/recovery-reset
func (h *AuthHandler) RecoveryReset(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username            string `json:"username"`
		TempToken           string `json:"temp_token"`
		DecryptedChallenge  string `json:"decrypted_challenge"`
		NewPassword         string `json:"new_password"`
		EncryptedPrivateKey string `json:"encrypted_private_key"`
		KDFParamsJSON       string `json:"kdf_params_json"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.DecryptedChallenge = strings.TrimSpace(req.DecryptedChallenge)

	if req.Username == "" || req.TempToken == "" || req.DecryptedChallenge == "" || len(req.NewPassword) < 8 {
		http.Error(w, `{"error":"Invalid reset parameters. Password must be at least 8 characters."}`, http.StatusBadRequest)
		return
	}

	lastDot := strings.LastIndex(req.TempToken, ".")
	if lastDot == -1 {
		http.Error(w, `{"error":"Invalid reset token format"}`, http.StatusBadRequest)
		return
	}
	payloadStr := req.TempToken[:lastDot]
	signatureHex := req.TempToken[lastDot+1:]

	lastColon := strings.LastIndex(payloadStr, ":")
	if lastColon == -1 {
		http.Error(w, `{"error":"Invalid reset token payload"}`, http.StatusBadRequest)
		return
	}
	tokenUsername := payloadStr[:lastColon]
	timestampStr := payloadStr[lastColon+1:]

	if tokenUsername != req.Username {
		http.Error(w, `{"error":"Token username mismatch"}`, http.StatusBadRequest)
		return
	}

	timestampInt, err := strconv.ParseInt(timestampStr, 10, 64)
	if err != nil {
		http.Error(w, `{"error":"Invalid token timestamp"}`, http.StatusBadRequest)
		return
	}
	tokenTime := time.Unix(timestampInt, 0)
	if time.Since(tokenTime) > 10*time.Minute {
		http.Error(w, `{"error":"Reset token has expired"}`, http.StatusBadRequest)
		return
	}

	expectedPayload := req.Username + ":" + req.DecryptedChallenge + ":" + timestampStr
	mac := hmac.New(sha256.New, []byte(h.challengeSecret))
	mac.Write([]byte(expectedPayload))
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	if subtle.ConstantTimeCompare([]byte(expectedSignature), []byte(signatureHex)) != 1 {
		http.Error(w, `{"error":"Invalid username or recovery key"}`, http.StatusUnauthorized)
		return
	}

	var id string
	err = h.DB.SQL.QueryRow("SELECT id FROM users WHERE username = ? AND status != 'disabled'", req.Username).Scan(&id)
	if err != nil {
		http.Error(w, `{"error":"Invalid username or recovery key"}`, http.StatusUnauthorized)
		return
	}

	hashedPass, err := HashPassword(req.NewPassword, DefaultArgon2Params)
	if err != nil {
		http.Error(w, `{"error":"Failed to hash password"}`, http.StatusInternalServerError)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = h.DB.SQL.Exec(`
		UPDATE users
		SET password_hash = ?,
		    encrypted_private_key = ?,
		    kdf_params_json = ?,
		    status = 'active',
		    updated_at = ?
		WHERE id = ?
	`, hashedPass, req.EncryptedPrivateKey, req.KDFParamsJSON, now, id)
	if err != nil {
		http.Error(w, `{"error":"Database error during password reset"}`, http.StatusInternalServerError)
		return
	}

	_, _ = h.DB.SQL.Exec("DELETE FROM sessions WHERE user_id = ?", id)

	_ = audit.LogSecurityEvent(h.DB, audit.EventPasswordReset, audit.AuditDetails{
		UserID: &id,
		Method: "recovery_key",
		Status: "success",
	}, r.RemoteAddr)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Password reset successfully. Please log in again."})
}
