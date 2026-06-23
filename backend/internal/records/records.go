package records

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Shik3i/KoalaFinance/backend/internal/auth"
	"github.com/Shik3i/KoalaFinance/backend/internal/db"
	"github.com/Shik3i/KoalaFinance/backend/internal/vault"
	"github.com/go-chi/chi/v5"
)

type EncryptedRecord struct {
	ID               string  `json:"id"`
	VaultID          string  `json:"vault_id"`
	RecordType       string  `json:"record_type"`
	SchemaVersion    int     `json:"schema_version"`
	CryptoVersion    int     `json:"crypto_version"`
	EncryptedPayload string  `json:"encrypted_payload"`
	Nonce            string  `json:"nonce"`
	CreatedBy        string  `json:"created_by"`
	UpdatedBy        string  `json:"updated_by"`
	Revision         int     `json:"revision"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
	DeletedAt        *string `json:"deleted_at,omitempty"`
}

type RecordsHandler struct {
	DB           *db.DB
	VaultHandler *vault.VaultHandler
}

func NewRecordsHandler(database *db.DB, vh *vault.VaultHandler) *RecordsHandler {
	return &RecordsHandler{
		DB:           database,
		VaultHandler: vh,
	}
}

func (h *RecordsHandler) ListRecords(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*auth.User)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	vaultId := chi.URLParam(r, "id")
	_, _, isMember := h.VaultHandler.CheckMembership(vaultId, user.ID)
	if !isMember {
		http.Error(w, `{"error":"Access denied - not a vault member"}`, http.StatusForbidden)
		return
	}

	rows, err := h.DB.SQL.Query(`
		SELECT id, vault_id, record_type, schema_version, crypto_version, encrypted_payload, nonce, created_by, updated_by, revision, created_at, updated_at
		FROM encrypted_records
		WHERE vault_id = ? AND deleted_at IS NULL
	`, vaultId)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var records []EncryptedRecord
	for rows.Next() {
		var rec EncryptedRecord
		err := rows.Scan(
			&rec.ID, &rec.VaultID, &rec.RecordType, &rec.SchemaVersion, &rec.CryptoVersion,
			&rec.EncryptedPayload, &rec.Nonce, &rec.CreatedBy, &rec.UpdatedBy, &rec.Revision,
			&rec.CreatedAt, &rec.UpdatedAt,
		)
		if err == nil {
			records = append(records, rec)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(records)
}

func (h *RecordsHandler) CreateRecord(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*auth.User)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	vaultId := chi.URLParam(r, "id")
	role, _, isMember := h.VaultHandler.CheckMembership(vaultId, user.ID)
	if !isMember {
		http.Error(w, `{"error":"Access denied - not a vault member"}`, http.StatusForbidden)
		return
	}

	if role == "read" {
		http.Error(w, `{"error":"Access denied - read-only member cannot write"}`, http.StatusForbidden)
		return
	}

	var req struct {
		ID               string `json:"id"`
		RecordType       string `json:"record_type"`
		SchemaVersion    int    `json:"schema_version"`
		CryptoVersion    int    `json:"crypto_version"`
		EncryptedPayload string `json:"encrypted_payload"`
		Nonce            string `json:"nonce"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	if req.ID == "" || req.RecordType == "" || req.EncryptedPayload == "" || req.Nonce == "" {
		http.Error(w, `{"error":"Missing required record fields"}`, http.StatusBadRequest)
		return
	}

	// Validate record type matches allowed values
	allowedTypes := map[string]bool{
		"account":        true,
		"category":       true,
		"recurring_item": true,
		"transaction":    true,
		"budget":         true,
		"settings":       true,
	}
	if !allowedTypes[req.RecordType] {
		http.Error(w, `{"error":"Invalid record type"}`, http.StatusBadRequest)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)

	_, err := h.DB.SQL.Exec(`
		INSERT INTO encrypted_records (id, vault_id, record_type, schema_version, crypto_version, encrypted_payload, nonce, created_by, updated_by, revision, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
	`, req.ID, vaultId, req.RecordType, req.SchemaVersion, req.CryptoVersion, req.EncryptedPayload, req.Nonce, user.ID, user.ID, now, now)

	if err != nil {
		http.Error(w, `{"error":"Failed to create record, might already exist"}`, http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(EncryptedRecord{
		ID:               req.ID,
		VaultID:          vaultId,
		RecordType:       req.RecordType,
		SchemaVersion:    req.SchemaVersion,
		CryptoVersion:    req.CryptoVersion,
		EncryptedPayload: req.EncryptedPayload,
		Nonce:            req.Nonce,
		CreatedBy:        user.ID,
		UpdatedBy:        user.ID,
		Revision:         1,
		CreatedAt:        now,
		UpdatedAt:        now,
	})
}

func (h *RecordsHandler) UpdateRecord(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*auth.User)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	vaultId := chi.URLParam(r, "id")
	recordId := chi.URLParam(r, "recordId")

	role, _, isMember := h.VaultHandler.CheckMembership(vaultId, user.ID)
	if !isMember {
		http.Error(w, `{"error":"Access denied - not a vault member"}`, http.StatusForbidden)
		return
	}

	if role == "read" {
		http.Error(w, `{"error":"Access denied - read-only member cannot write"}`, http.StatusForbidden)
		return
	}

	var req struct {
		SchemaVersion    int    `json:"schema_version"`
		CryptoVersion    int    `json:"crypto_version"`
		EncryptedPayload string `json:"encrypted_payload"`
		Nonce            string `json:"nonce"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	if req.EncryptedPayload == "" || req.Nonce == "" {
		http.Error(w, `{"error":"Missing payload or nonce"}`, http.StatusBadRequest)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)

	// Fetch current revision
	var currentRevision int
	err := h.DB.SQL.QueryRow("SELECT revision FROM encrypted_records WHERE id = ? AND vault_id = ? AND deleted_at IS NULL", recordId, vaultId).Scan(&currentRevision)
	if err != nil {
		http.Error(w, `{"error":"Record not found"}`, http.StatusNotFound)
		return
	}

	nextRevision := currentRevision + 1

	res, err := h.DB.SQL.Exec(`
		UPDATE encrypted_records 
		SET schema_version = ?, crypto_version = ?, encrypted_payload = ?, nonce = ?, updated_by = ?, revision = ?, updated_at = ?
		WHERE id = ? AND vault_id = ? AND deleted_at IS NULL
	`, req.SchemaVersion, req.CryptoVersion, req.EncryptedPayload, req.Nonce, user.ID, nextRevision, now, recordId, vaultId)

	if err != nil {
		http.Error(w, `{"error":"Failed to update record"}`, http.StatusInternalServerError)
		return
	}

	affected, _ := res.RowsAffected()
	if affected == 0 {
		http.Error(w, `{"error":"Record not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":  "Record updated successfully",
		"revision": nextRevision,
	})
}

func (h *RecordsHandler) DeleteRecord(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*auth.User)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	vaultId := chi.URLParam(r, "id")
	recordId := chi.URLParam(r, "recordId")

	role, _, isMember := h.VaultHandler.CheckMembership(vaultId, user.ID)
	if !isMember {
		http.Error(w, `{"error":"Access denied - not a vault member"}`, http.StatusForbidden)
		return
	}

	if role == "read" {
		http.Error(w, `{"error":"Access denied - read-only member cannot write"}`, http.StatusForbidden)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)

	res, err := h.DB.SQL.Exec(`
		UPDATE encrypted_records 
		SET deleted_at = ?, updated_at = ?, updated_by = ?
		WHERE id = ? AND vault_id = ? AND deleted_at IS NULL
	`, now, now, user.ID, recordId, vaultId)

	if err != nil {
		http.Error(w, `{"error":"Failed to delete record"}`, http.StatusInternalServerError)
		return
	}

	affected, _ := res.RowsAffected()
	if affected == 0 {
		http.Error(w, `{"error":"Record not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Record marked as deleted"})
}
