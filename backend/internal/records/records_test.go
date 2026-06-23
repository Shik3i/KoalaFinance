package records

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Shik3i/KoalaFinance/backend/internal/auth"
	"github.com/Shik3i/KoalaFinance/backend/internal/db"
	"github.com/Shik3i/KoalaFinance/backend/internal/vault"
	"github.com/go-chi/chi/v5"
)

func setupTestDB(t *testing.T) (*db.DB, string) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test.db")
	t.Setenv("KOALAFINANCE_DATABASE_PATH", dbPath)

	database, err := db.Connect()
	if err != nil {
		t.Fatalf("failed to connect to test db: %v", err)
	}
	return database, dbPath
}

func TestVaultAndRecordAuthorization(t *testing.T) {
	database, _ := setupTestDB(t)
	defer database.SQL.Close()

	vaultHandler := vault.NewVaultHandler(database)
	recordsHandler := NewRecordsHandler(database, vaultHandler)

	// Helper to insert users
	createUser := func(id, username, role string) *auth.User {
		now := time.Now().Format(time.RFC3339)
		_, err := database.SQL.Exec(`
			INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
			VALUES (?, ?, 'hash', ?, 'active', ?, ?)
		`, id, username, role, now, now)
		if err != nil {
			t.Fatalf("failed to create user: %v", err)
		}
		return &auth.User{ID: id, Username: username, Role: role, Status: "active"}
	}

	owner := createUser("u1", "owner@test.com", "user")
	writer := createUser("u2", "writer@test.com", "user")
	reader := createUser("u3", "reader@test.com", "user")
	nonmember := createUser("u4", "nonmember@test.com", "user")
	admin := createUser("u5", "admin@test.com", "admin")

	// 1. Owner creates vault
	reqBody := `{"encrypted_vault_key":"enc_vault_key_for_owner"}`
	req := httptest.NewRequest("POST", "/api/vaults", bytes.NewBufferString(reqBody))
	req = req.WithContext(contextWithUser(req.Context(), owner))
	rec := httptest.NewRecorder()
	vaultHandler.CreateVault(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("Expected 210 Created, got %d", rec.Code)
	}

	var createdVault vault.Vault
	_ = json.NewDecoder(rec.Body).Decode(&createdVault)
	vaultId := createdVault.ID

	// 2. Owner invites writer and reader
	addMember := func(targetId, role, encKey string) {
		payload := map[string]string{
			"user_id":             targetId,
			"role":                role,
			"encrypted_vault_key": encKey,
		}
		b, _ := json.Marshal(payload)
		rReq := httptest.NewRequest("POST", "/api/vaults/"+vaultId+"/members", bytes.NewReader(b))
		rReq = rReq.WithContext(contextWithUser(rReq.Context(), owner))
		// Mock Chi Router URL Param
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", vaultId)
		rReq = rReq.WithContext(contextWithRouteContext(rReq.Context(), rctx))

		rRec := httptest.NewRecorder()
		vaultHandler.AddMember(rRec, rReq)
		if rRec.Code != http.StatusCreated {
			t.Fatalf("Failed to add member %s: %d - %s", targetId, rRec.Code, rRec.Body.String())
		}
	}

	addMember(writer.ID, "write", "enc_vault_key_for_writer")
	addMember(reader.ID, "read", "enc_vault_key_for_reader")

	// 3. Test record creation by Owner (should succeed)
	createRecord := func(currentUser *auth.User, recordId, payload string) int {
		recPayload := map[string]interface{}{
			"id":                recordId,
			"record_type":       "transaction",
			"schema_version":    1,
			"crypto_version":    1,
			"encrypted_payload": payload,
			"nonce":             "nonce_base64",
		}
		b, _ := json.Marshal(recPayload)
		rReq := httptest.NewRequest("POST", "/api/vaults/"+vaultId+"/records", bytes.NewReader(b))
		rReq = rReq.WithContext(contextWithUser(rReq.Context(), currentUser))

		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", vaultId)
		rReq = rReq.WithContext(contextWithRouteContext(rReq.Context(), rctx))

		rRec := httptest.NewRecorder()
		recordsHandler.CreateRecord(rRec, rReq)
		return rRec.Code
	}

	code := createRecord(owner, "rec_owner", "owner_ciphertext")
	if code != http.StatusCreated {
		t.Errorf("Expected 201 Created for owner record, got %d", code)
	}

	// 4. Test record creation by Writer (should succeed)
	code = createRecord(writer, "rec_writer", "writer_ciphertext")
	if code != http.StatusCreated {
		t.Errorf("Expected 201 Created for writer record, got %d", code)
	}

	// 5. Test record creation by Reader (should fail 403)
	code = createRecord(reader, "rec_reader", "reader_ciphertext")
	if code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for reader record creation, got %d", code)
	}

	// 6. Test record creation by Non-Member (should fail 403)
	code = createRecord(nonmember, "rec_nonmember", "nonmember_ciphertext")
	if code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for non-member record creation, got %d", code)
	}

	// 7. Test record listing
	listRecords := func(currentUser *auth.User) (int, []EncryptedRecord) {
		rReq := httptest.NewRequest("GET", "/api/vaults/"+vaultId+"/records", nil)
		rReq = rReq.WithContext(contextWithUser(rReq.Context(), currentUser))

		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", vaultId)
		rReq = rReq.WithContext(contextWithRouteContext(rReq.Context(), rctx))

		rRec := httptest.NewRecorder()
		recordsHandler.ListRecords(rRec, rReq)

		var recs []EncryptedRecord
		if rRec.Code == http.StatusOK {
			_ = json.NewDecoder(rRec.Body).Decode(&recs)
		}
		return rRec.Code, recs
	}

	// Reader lists records (should succeed)
	lCode, recs := listRecords(reader)
	if lCode != http.StatusOK {
		t.Errorf("Expected 200 OK for reader list records, got %d", lCode)
	}
	if len(recs) != 2 {
		t.Errorf("Expected 2 records visible, got %d", len(recs))
	}

	// Non-member lists records (should fail 403)
	lCode, _ = listRecords(nonmember)
	if lCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for non-member list records, got %d", lCode)
	}

	// Admin lists records (should fail 403 - no implicit access)
	lCode, _ = listRecords(admin)
	if lCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for admin list records (no implicit access), got %d", lCode)
	}
}

func TestPlaintextLeakageCheck(t *testing.T) {
	database, dbPath := setupTestDB(t)
	defer database.SQL.Close()

	// 1. Insert an encrypted record containing encrypted payload.
	// We will simulate client-side encryption. The client encrypts:
	// {"merchant":"Netflix","amount":29.99,"note":"Rent ChatGPT & Groceries 123456"}
	// Into ciphertext base64: "aGVsbG8gd29ybGQ=" (which is "hello world")
	// The database only stores "aGVsbG8gd29ybGQ=" in encrypted_payload.
	// None of the plaintext strings "Netflix", "ChatGPT", "Salary", "Rent", "Groceries", "123456", "29.99" should show up in DB files.

	now := time.Now().Format(time.RFC3339)
	_, _ = database.SQL.Exec(`
		INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
		VALUES ('u1', 'user@test.local', 'hash', 'user', 'active', ?, ?)
	`, now, now)

	_, _ = database.SQL.Exec(`
		INSERT INTO vaults (id, owner_user_id, created_at, updated_at)
		VALUES ('v1', 'u1', ?, ?)
	`, now, now)

	_, _ = database.SQL.Exec(`
		INSERT INTO vault_members (vault_id, user_id, role, encrypted_vault_key, created_at, updated_at)
		VALUES ('v1', 'u1', 'owner', 'wrappedkey', ?, ?)
	`, now, now)

	// Insert record with encrypted payload (ciphertext does NOT contain plaintext terms)
	_, err := database.SQL.Exec(`
		INSERT INTO encrypted_records (id, vault_id, record_type, schema_version, crypto_version, encrypted_payload, nonce, created_by, updated_by, created_at, updated_at)
		VALUES ('rec_1', 'v1', 'transaction', 1, 1, 'aGVsbG8gd29ybGQ=', 'noncebase64', 'u1', 'u1', ?, ?)
	`, now, now)
	if err != nil {
		t.Fatalf("failed to insert encrypted record: %v", err)
	}

	// 2. Perform SQLite WAL Checkpoint to force writing WAL buffers to main database file
	_, err = database.SQL.Exec("PRAGMA wal_checkpoint(TRUNCATE);")
	if err != nil {
		t.Fatalf("failed to checkpoint WAL: %v", err)
	}

	// 3. Scan the SQLite files for presence of forbidden plaintext terms
	forbiddenTerms := []string{
		"Netflix",
		"ChatGPT",
		"Salary",
		"Rent",
		"Groceries",
		"123456",
		"29.99",
	}

	dbDir := filepath.Dir(dbPath)
	files, err := os.ReadDir(dbDir)
	if err != nil {
		t.Fatalf("failed to read db directory: %v", err)
	}

	for _, file := range files {
		// Scan .db, -wal, -shm files
		name := file.Name()
		if strings.HasPrefix(name, "test.db") {
			filePath := filepath.Join(dbDir, name)
			content, err := os.ReadFile(filePath)
			if err != nil {
				t.Fatalf("failed to read database file %s: %v", name, err)
			}

			// Search for forbidden terms
			for _, term := range forbiddenTerms {
				if bytes.Contains(content, []byte(term)) {
					t.Errorf("SECURITY FAILURE: plaintext leakage detected! Database file %s contains term %q", name, term)
				}
			}
		}
	}
}

// Helpers for auth and routing context injection in tests
type contextKey string

func contextWithRouteContext(ctx context.Context, rctx *chi.Context) context.Context {
	return context.WithValue(ctx, chi.RouteCtxKey, rctx)
}

func contextWithUser(ctx context.Context, u *auth.User) context.Context {
	return context.WithValue(ctx, "user", u)
}
