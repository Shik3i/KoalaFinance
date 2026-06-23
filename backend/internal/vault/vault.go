package vault

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Shik3i/KoalaFinance/backend/internal/auth"
	"github.com/Shik3i/KoalaFinance/backend/internal/db"
	"github.com/go-chi/chi/v5"
)

type Vault struct {
	ID           string `json:"id"`
	OwnerUserID  string `json:"owner_user_id"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
	Role         string `json:"role,omitempty"`                // Injected user role
	EncryptedKey string `json:"encrypted_vault_key,omitempty"` // User's wrapped vault key
}

type Member struct {
	VaultID           string `json:"vault_id"`
	UserID            string `json:"user_id"`
	Username          string `json:"username"`
	Role              string `json:"role"`
	EncryptedVaultKey string `json:"encrypted_vault_key"`
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at"`
}

type VaultHandler struct {
	DB *db.DB
}

func NewVaultHandler(database *db.DB) *VaultHandler {
	return &VaultHandler{DB: database}
}

// Check if user is member of a vault and returns their role and encrypted key
func (h *VaultHandler) CheckMembership(vaultId, userId string) (string, string, bool) {
	var role, encKey string
	err := h.DB.SQL.QueryRow(`
		SELECT role, encrypted_vault_key 
		FROM vault_members 
		WHERE vault_id = ? AND user_id = ?
	`, vaultId, userId).Scan(&role, &encKey)
	if err != nil {
		return "", "", false
	}
	return role, encKey, true
}

func (h *VaultHandler) CreateVault(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*auth.User)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		EncryptedVaultKey string `json:"encrypted_vault_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.EncryptedVaultKey == "" {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	vaultId := auth.GenerateRandomHex(16)
	now := time.Now().UTC().Format(time.RFC3339)

	tx, err := h.DB.SQL.Begin()
	if err != nil {
		http.Error(w, `{"error":"Database transaction error"}`, http.StatusInternalServerError)
		return
	}

	// Insert Vault
	_, err = tx.Exec(`
		INSERT INTO vaults (id, owner_user_id, created_at, updated_at)
		VALUES (?, ?, ?, ?)
	`, vaultId, user.ID, now, now)
	if err != nil {
		tx.Rollback()
		http.Error(w, `{"error":"Failed to create vault"}`, http.StatusInternalServerError)
		return
	}

	// Insert Owner as member
	_, err = tx.Exec(`
		INSERT INTO vault_members (vault_id, user_id, role, encrypted_vault_key, created_at, updated_at)
		VALUES (?, ?, 'owner', ?, ?, ?)
	`, vaultId, user.ID, req.EncryptedVaultKey, now, now)
	if err != nil {
		tx.Rollback()
		http.Error(w, `{"error":"Failed to add owner member"}`, http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, `{"error":"Transaction commit failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(Vault{
		ID:           vaultId,
		OwnerUserID:  user.ID,
		CreatedAt:    now,
		UpdatedAt:    now,
		Role:         "owner",
		EncryptedKey: req.EncryptedVaultKey,
	})
}

func (h *VaultHandler) ListVaults(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*auth.User)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	rows, err := h.DB.SQL.Query(`
		SELECT v.id, v.owner_user_id, v.created_at, v.updated_at, m.role, m.encrypted_vault_key
		FROM vaults v
		JOIN vault_members m ON v.id = m.vault_id
		WHERE m.user_id = ? AND v.deleted_at IS NULL
	`, user.ID)
	if err != nil {
		http.Error(w, `{"error":"Database query error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var vaults []Vault
	for rows.Next() {
		var v Vault
		err := rows.Scan(&v.ID, &v.OwnerUserID, &v.CreatedAt, &v.UpdatedAt, &v.Role, &v.EncryptedKey)
		if err == nil {
			vaults = append(vaults, v)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(vaults)
}

func (h *VaultHandler) GetVault(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*auth.User)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	vaultId := chi.URLParam(r, "id")
	role, encKey, isMember := h.CheckMembership(vaultId, user.ID)
	if !isMember {
		http.Error(w, `{"error":"Access denied - not a vault member"}`, http.StatusForbidden)
		return
	}

	var v Vault
	err := h.DB.SQL.QueryRow(`
		SELECT id, owner_user_id, created_at, updated_at
		FROM vaults WHERE id = ? AND deleted_at IS NULL
	`, vaultId).Scan(&v.ID, &v.OwnerUserID, &v.CreatedAt, &v.UpdatedAt)

	if err != nil {
		http.Error(w, `{"error":"Vault not found"}`, http.StatusNotFound)
		return
	}

	v.Role = role
	v.EncryptedKey = encKey

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func (h *VaultHandler) DeleteVault(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*auth.User)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	vaultId := chi.URLParam(r, "id")
	role, _, isMember := h.CheckMembership(vaultId, user.ID)
	if !isMember || role != "owner" {
		http.Error(w, `{"error":"Forbidden - owners only"}`, http.StatusForbidden)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err := h.DB.SQL.Exec("UPDATE vaults SET deleted_at = ? WHERE id = ?", now, vaultId)
	if err != nil {
		http.Error(w, `{"error":"Failed to delete vault"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Vault marked as deleted"})
}

func (h *VaultHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*auth.User)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	vaultId := chi.URLParam(r, "id")
	_, _, isMember := h.CheckMembership(vaultId, user.ID)
	if !isMember {
		http.Error(w, `{"error":"Forbidden"}`, http.StatusForbidden)
		return
	}

	rows, err := h.DB.SQL.Query(`
		SELECT m.vault_id, m.user_id, u.username, m.role, m.encrypted_vault_key, m.created_at, m.updated_at
		FROM vault_members m
		JOIN users u ON m.user_id = u.id
		WHERE m.vault_id = ?
	`, vaultId)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var members []Member
	for rows.Next() {
		var m Member
		err := rows.Scan(&m.VaultID, &m.UserID, &m.Username, &m.Role, &m.EncryptedVaultKey, &m.CreatedAt, &m.UpdatedAt)
		if err == nil {
			members = append(members, m)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(members)
}

func (h *VaultHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*auth.User)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	vaultId := chi.URLParam(r, "id")
	role, _, isMember := h.CheckMembership(vaultId, user.ID)
	if !isMember || role != "owner" {
		http.Error(w, `{"error":"Forbidden - owner access only"}`, http.StatusForbidden)
		return
	}

	var req struct {
		UserID            string `json:"user_id"`
		Role              string `json:"role"`
		EncryptedVaultKey string `json:"encrypted_vault_key"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	if req.Role != "write" && req.Role != "read" {
		http.Error(w, `{"error":"Invalid role, must be read or write"}`, http.StatusBadRequest)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err := h.DB.SQL.Exec(`
		INSERT INTO vault_members (vault_id, user_id, role, encrypted_vault_key, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, vaultId, req.UserID, req.Role, req.EncryptedVaultKey, now, now)

	if err != nil {
		http.Error(w, `{"error":"Failed to add member, might already exist"}`, http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "Member added successfully"})
}

func (h *VaultHandler) UpdateMember(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*auth.User)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	vaultId := chi.URLParam(r, "id")
	targetUserId := chi.URLParam(r, "userId")

	role, _, isMember := h.CheckMembership(vaultId, user.ID)
	if !isMember || role != "owner" {
		http.Error(w, `{"error":"Forbidden - owner access only"}`, http.StatusForbidden)
		return
	}

	if targetUserId == user.ID {
		http.Error(w, `{"error":"Cannot modify your own owner role"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || (req.Role != "read" && req.Role != "write") {
		http.Error(w, `{"error":"Invalid role, must be read or write"}`, http.StatusBadRequest)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	res, err := h.DB.SQL.Exec(`
		UPDATE vault_members 
		SET role = ?, updated_at = ? 
		WHERE vault_id = ? AND user_id = ? AND role != 'owner'
	`, req.Role, now, vaultId, targetUserId)

	if err != nil {
		http.Error(w, `{"error":"Failed to update member"}`, http.StatusInternalServerError)
		return
	}

	affected, _ := res.RowsAffected()
	if affected == 0 {
		http.Error(w, `{"error":"Member not found or is vault owner"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Member role updated"})
}

func (h *VaultHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value("user").(*auth.User)
	if !ok || user == nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	vaultId := chi.URLParam(r, "id")
	targetUserId := chi.URLParam(r, "userId")

	role, _, isMember := h.CheckMembership(vaultId, user.ID)
	if !isMember || role != "owner" {
		http.Error(w, `{"error":"Forbidden - owner access only"}`, http.StatusForbidden)
		return
	}

	if targetUserId == user.ID {
		http.Error(w, `{"error":"Cannot remove yourself from your own vault"}`, http.StatusBadRequest)
		return
	}

	res, err := h.DB.SQL.Exec(`
		DELETE FROM vault_members 
		WHERE vault_id = ? AND user_id = ? AND role != 'owner'
	`, vaultId, targetUserId)

	if err != nil {
		http.Error(w, `{"error":"Failed to remove member"}`, http.StatusInternalServerError)
		return
	}

	affected, _ := res.RowsAffected()
	if affected == 0 {
		http.Error(w, `{"error":"Member not found or is vault owner"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Member removed successfully"})
}
