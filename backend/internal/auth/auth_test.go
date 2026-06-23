package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Shik3i/KoalaFinance/backend/internal/db"
	"github.com/Shik3i/KoalaFinance/backend/internal/middleware"
	"github.com/go-chi/chi/v5"
)

func setupTestDB(t *testing.T) *db.DB {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test.db")
	t.Setenv("KOALAFINANCE_DATABASE_PATH", dbPath)

	database, err := db.Connect()
	if err != nil {
		t.Fatalf("failed to connect to test db: %v", err)
	}
	return database
}

func TestPasswordHashing(t *testing.T) {
	password := "securePass123"

	// Test Hashing
	hash, err := HashPassword(password, DefaultArgon2Params)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Errorf("Expected argon2id prefix, got %s", hash)
	}

	// Test Verification Success
	ok, err := VerifyPassword(password, hash)
	if err != nil {
		t.Fatalf("VerifyPassword failed: %v", err)
	}
	if !ok {
		t.Error("Expected password verification to succeed")
	}

	// Test Verification Failure
	ok, err = VerifyPassword("wrongPass", hash)
	if err != nil {
		t.Fatalf("VerifyPassword failed on mismatch: %v", err)
	}
	if ok {
		t.Error("Expected password verification to fail for wrong password")
	}
}

func TestAdminBootstrap(t *testing.T) {
	database := setupTestDB(t)
	defer database.SQL.Close()

	// 1. Env vars present -> Bootstrap admin
	username := "admin@local.test"
	password := "adminPass123"
	t.Setenv("KOALAFINANCE_ADMIN_USERNAME", username)
	t.Setenv("KOALAFINANCE_ADMIN_PASSWORD", password)

	BootstrapAdmin(database)

	var count int
	err := database.SQL.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'admin'").Scan(&count)
	if err != nil {
		t.Fatalf("DB query failed: %v", err)
	}
	if count != 1 {
		t.Errorf("Expected 1 admin, got %d", count)
	}

	// Verify username
	var dbUsername string
	err = database.SQL.QueryRow("SELECT username FROM users WHERE role = 'admin'").Scan(&dbUsername)
	if err != nil {
		t.Fatalf("DB query failed: %v", err)
	}
	if dbUsername != username {
		t.Errorf("Expected username %s, got %s", username, dbUsername)
	}

	// 2. Overwrite protection -> Modify admin env and run again, should NOT overwrite
	t.Setenv("KOALAFINANCE_ADMIN_USERNAME", "newadmin@local.test")
	BootstrapAdmin(database)

	var newCount int
	_ = database.SQL.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'admin'").Scan(&newCount)
	if newCount != 1 {
		t.Errorf("Expected count to remain 1, got %d", newCount)
	}

	var currentUsername string
	_ = database.SQL.QueryRow("SELECT username FROM users WHERE role = 'admin'").Scan(&currentUsername)
	if currentUsername != username {
		t.Errorf("Admin username should not have changed. Expected %s, got %s", username, currentUsername)
	}
}

func TestRegistrationToggleAndRegister(t *testing.T) {
	database := setupTestDB(t)
	defer database.SQL.Close()

	handler := NewAuthHandler(database)

	// 1. Default registration is disabled -> should fail
	if handler.IsRegistrationEnabled() {
		t.Error("Expected registration to be disabled by default")
	}

	reqBody := `{"username":"user@test.com","password":"password123","public_key":"pubkey","encrypted_private_key":"encprivkey","encrypted_private_key_recovery":"encprivkeyrecov","kdf_params_json":"{}","recovery_kdf_params_json":"{}"}`
	req := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(reqBody))
	rec := httptest.NewRecorder()

	handler.Register(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for disabled registration, got %d", rec.Code)
	}

	// 2. Enable registration -> should succeed
	_, _ = database.SQL.Exec("INSERT INTO app_settings (key, value, updated_at) VALUES ('registration_enabled', 'true', ?)", time.Now().Format(time.RFC3339))

	if !handler.IsRegistrationEnabled() {
		t.Error("Expected registration to be enabled")
	}

	req = httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(reqBody))
	rec = httptest.NewRecorder()
	handler.Register(rec, req)

	if rec.Code != http.StatusCreated {
		t.Errorf("Expected 201 Created, got %d. Body: %s", rec.Code, rec.Body.String())
	}

	// Check user in DB
	var exists bool
	_ = database.SQL.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE username = 'user@test.com')").Scan(&exists)
	if !exists {
		t.Error("User was not found in database")
	}
}

func TestLoginLogoutSession(t *testing.T) {
	database := setupTestDB(t)
	defer database.SQL.Close()

	handler := NewAuthHandler(database)

	// Register user
	_, _ = database.SQL.Exec("INSERT INTO app_settings (key, value, updated_at) VALUES ('registration_enabled', 'true', ?)", time.Now().Format(time.RFC3339))
	regBody := `{"username":"loginuser@test.com","password":"secretpassword","public_key":"pubkey","encrypted_private_key":"encpriv","encrypted_private_key_recovery":"encrec","kdf_params_json":"{}","recovery_kdf_params_json":"{}"}`
	reqReg := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	recReg := httptest.NewRecorder()
	handler.Register(recReg, reqReg)

	// 1. Login success
	loginBody := `{"username":"loginuser@test.com","password":"secretpassword"}`
	reqLog := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(loginBody))
	recLog := httptest.NewRecorder()
	handler.Login(recLog, reqLog)

	if recLog.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK login, got %d", recLog.Code)
	}

	// Verify cookie set
	cookies := recLog.Result().Cookies()
	var sessionCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == "koalafinance_session" {
			sessionCookie = c
			break
		}
	}
	if sessionCookie == nil {
		t.Fatal("Expected koalafinance_session cookie to be set")
	}
	if !sessionCookie.HttpOnly {
		t.Error("Expected session cookie to be HttpOnly")
	}

	// Parse response
	var loginResp struct {
		CSRFToken string `json:"csrf_token"`
	}
	_ = json.NewDecoder(recLog.Body).Decode(&loginResp)
	if loginResp.CSRFToken == "" {
		t.Error("Expected CSRF token in response")
	}

	// 2. Validate session via AuthenticateMiddleware
	reqMe := httptest.NewRequest("GET", "/api/auth/me", nil)
	reqMe.AddCookie(sessionCookie)
	recMe := httptest.NewRecorder()

	router := chi.NewRouter()
	router.Use(handler.AuthenticateMiddleware)
	router.Get("/api/auth/me", handler.Me)
	router.ServeHTTP(recMe, reqMe)

	if recMe.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for authenticated me, got %d", recMe.Code)
	}

	var meResp map[string]interface{}
	_ = json.NewDecoder(recMe.Body).Decode(&meResp)
	userMap := meResp["user"].(map[string]interface{})
	if userMap["username"] != "loginuser@test.com" {
		t.Errorf("Expected username loginuser@test.com, got %s", userMap["username"])
	}

	csrfTokenMe := meResp["csrf_token"].(string)
	if csrfTokenMe == "" {
		t.Error("Expected non-empty csrf_token in me response")
	}
	if csrfTokenMe != loginResp.CSRFToken {
		t.Errorf("Expected CSRF token from /me to match login CSRF token. Got %s, expected %s", csrfTokenMe, loginResp.CSRFToken)
	}

	// 3. Logout
	reqOut := httptest.NewRequest("POST", "/api/auth/logout", nil)
	reqOut.AddCookie(sessionCookie)
	recOut := httptest.NewRecorder()
	handler.Logout(recOut, reqOut)

	if recOut.Code != http.StatusOK {
		t.Errorf("Expected 200 OK for logout, got %d", recOut.Code)
	}

	// Session should be removed in database
	tokenHash := HashSessionToken(sessionCookie.Value)
	var count int
	_ = database.SQL.QueryRow("SELECT COUNT(*) FROM sessions WHERE token_hash = ?", tokenHash).Scan(&count)
	if count != 0 {
		t.Error("Expected session row to be deleted on logout")
	}
}

func TestCSRFMutationProtection(t *testing.T) {
	database := setupTestDB(t)
	defer database.SQL.Close()

	handler := NewAuthHandler(database)

	// Create user session directly
	userId := "user123"
	_, _ = database.SQL.Exec(`
		INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
		VALUES (?, 'csrf@test.com', 'hash', 'user', 'active', ?, ?)
	`, userId, time.Now().Format(time.RFC3339), time.Now().Format(time.RFC3339))

	sessionToken := "sessiontoken123"
	tokenHash := HashSessionToken(sessionToken)
	csrfSecret := "csrfsecret123"
	_, _ = database.SQL.Exec(`
		INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, csrf_secret)
		VALUES ('s1', ?, ?, ?, ?, ?)
	`, userId, tokenHash, time.Now().Format(time.RFC3339), time.Now().Add(1*time.Hour).Format(time.RFC3339), csrfSecret)

	cookie := &http.Cookie{
		Name:  "koalafinance_session",
		Value: sessionToken,
	}

	// Router with Auth and CSRF middleware
	router := chi.NewRouter()
	router.Use(handler.AuthenticateMiddleware)
	router.Use(middleware.CSRFMiddleware)

	// A mutation mock handler
	mutated := false
	router.Post("/api/mutate", func(w http.ResponseWriter, r *http.Request) {
		mutated = true
		w.WriteHeader(http.StatusOK)
	})

	// 1. Call without CSRF token -> should fail 403
	req1 := httptest.NewRequest("POST", "/api/mutate", nil)
	req1.AddCookie(cookie)
	rec1 := httptest.NewRecorder()
	router.ServeHTTP(rec1, req1)

	if rec1.Code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden without CSRF token, got %d", rec1.Code)
	}
	if mutated {
		t.Error("Mutation handler was executed despite missing CSRF token")
	}

	// 2. Call with invalid CSRF token -> should fail 403
	req2 := httptest.NewRequest("POST", "/api/mutate", nil)
	req2.AddCookie(cookie)
	req2.Header.Set("X-CSRF-Token", "wrongcsrf")
	rec2 := httptest.NewRecorder()
	router.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for wrong CSRF token, got %d", rec2.Code)
	}

	// 3. Call with correct CSRF token -> should succeed 200
	req3 := httptest.NewRequest("POST", "/api/mutate", nil)
	req3.AddCookie(cookie)
	req3.Header.Set("X-CSRF-Token", csrfSecret)
	rec3 := httptest.NewRecorder()
	router.ServeHTTP(rec3, req3)

	if rec3.Code != http.StatusOK {
		t.Errorf("Expected 200 OK with correct CSRF token, got %d", rec3.Code)
	}
	if !mutated {
		t.Error("Mutation handler failed to execute with correct CSRF token")
	}
}

func TestDisabledUserRejected(t *testing.T) {
	database := setupTestDB(t)
	defer database.SQL.Close()

	handler := NewAuthHandler(database)

	// Create user but set as disabled
	userId := "user456"
	_, _ = database.SQL.Exec(`
		INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
		VALUES (?, 'disabled@test.com', 'hash', 'user', 'disabled', ?, ?)
	`, userId, time.Now().Format(time.RFC3339), time.Now().Format(time.RFC3339))

	sessionToken := "disabledtoken"
	tokenHash := HashSessionToken(sessionToken)
	csrfSecret := "csrfdisabled"
	_, _ = database.SQL.Exec(`
		INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, csrf_secret)
		VALUES ('s2', ?, ?, ?, ?, ?)
	`, userId, tokenHash, time.Now().Format(time.RFC3339), time.Now().Add(1*time.Hour).Format(time.RFC3339), csrfSecret)

	cookie := &http.Cookie{
		Name:  "koalafinance_session",
		Value: sessionToken,
	}

	// Call /me, should get 401/Unauthorized because AuthenticateMiddleware rejects disabled user
	reqMe := httptest.NewRequest("GET", "/api/auth/me", nil)
	reqMe.AddCookie(cookie)
	recMe := httptest.NewRecorder()

	router := chi.NewRouter()
	router.Use(handler.AuthenticateMiddleware)
	router.Get("/api/auth/me", handler.Me)
	router.ServeHTTP(recMe, reqMe)

	if recMe.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 Unauthorized for disabled user request, got %d", recMe.Code)
	}
}

func TestBootstrapCryptoSetup(t *testing.T) {
	database := setupTestDB(t)
	defer database.SQL.Close()

	handler := NewAuthHandler(database)

	// Create user without public key or encrypted private key (status: active or reset_required)
	userId := "bootstrap_admin"
	_, _ = database.SQL.Exec(`
		INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
		VALUES (?, 'admin@test.com', 'admin_password_hash', 'admin', 'active', ?, ?)
	`, userId, time.Now().Format(time.RFC3339), time.Now().Format(time.RFC3339))

	sessionToken := "admintoken"
	tokenHash := HashSessionToken(sessionToken)
	csrfSecret := "admincsrf"
	_, _ = database.SQL.Exec(`
		INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, csrf_secret)
		VALUES ('s_admin', ?, ?, ?, ?, ?)
	`, userId, tokenHash, time.Now().Format(time.RFC3339), time.Now().Add(1*time.Hour).Format(time.RFC3339), csrfSecret)

	cookie := &http.Cookie{
		Name:  "koalafinance_session",
		Value: sessionToken,
	}

	// Payload with public_key and other crypto fields
	reqBody := `{"public_key":"base64publickey","encrypted_private_key":"encprivkey","encrypted_private_key_recovery":"encprivkeyrec","kdf_params_json":"kdfparams","recovery_kdf_params_json":"reckdf"}`
	req := httptest.NewRequest("POST", "/api/auth/recovery/rewrap-private-key", strings.NewReader(reqBody))
	req.AddCookie(cookie)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router := chi.NewRouter()
	router.Use(handler.AuthenticateMiddleware)
	router.Post("/api/auth/recovery/rewrap-private-key", handler.CompleteResetOrRewrap)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d. Body: %s", rec.Code, rec.Body.String())
	}

	// Verify database record has keys set
	var pubKey, encPrivKey, encPrivKeyRec, kdf, recKdf, status string
	err := database.SQL.QueryRow("SELECT public_key, encrypted_private_key, encrypted_private_key_recovery, kdf_params_json, recovery_kdf_params_json, status FROM users WHERE id = ?", userId).Scan(
		&pubKey, &encPrivKey, &encPrivKeyRec, &kdf, &recKdf, &status,
	)
	if err != nil {
		t.Fatalf("Failed to query user: %v", err)
	}

	if pubKey != "base64publickey" {
		t.Errorf("Expected public_key to be 'base64publickey', got '%s'", pubKey)
	}
	if encPrivKey != "encprivkey" {
		t.Errorf("Expected encrypted_private_key to be 'encprivkey', got '%s'", encPrivKey)
	}
	if encPrivKeyRec != "encprivkeyrec" {
		t.Errorf("Expected encrypted_private_key_recovery to be 'encprivkeyrec', got '%s'", encPrivKeyRec)
	}
	if kdf != "kdfparams" {
		t.Errorf("Expected kdf_params_json to be 'kdfparams', got '%s'", kdf)
	}
	if recKdf != "reckdf" {
		t.Errorf("Expected recovery_kdf_params_json to be 'reckdf', got '%s'", recKdf)
	}
	if status != "active" {
		t.Errorf("Expected status to be 'active', got '%s'", status)
	}
}
