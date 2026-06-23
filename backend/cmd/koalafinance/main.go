package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/Shik3i/KoalaFinance/backend/internal/auth"
	"github.com/Shik3i/KoalaFinance/backend/internal/db"
	"github.com/Shik3i/KoalaFinance/backend/internal/middleware"
	"github.com/Shik3i/KoalaFinance/backend/internal/records"
	"github.com/Shik3i/KoalaFinance/backend/internal/vault"
	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
)

type App struct {
	DB             *db.DB
	AuthHandler    *auth.AuthHandler
	VaultHandler   *vault.VaultHandler
	RecordsHandler *records.RecordsHandler
	Router         *chi.Mux
}

func main() {
	port := os.Getenv("KOALAFINANCE_PORT")
	if port == "" {
		port = "8080"
	}

	// 1. Connect to database & run migrations
	database, err := db.Connect()
	if err != nil {
		log.Fatalf("Database connection/migration failed: %v", err)
	}
	defer database.SQL.Close()

	// 2. Bootstrap initial admin
	auth.BootstrapAdmin(database)

	// 3. Initialize handlers
	authHandler := auth.NewAuthHandler(database)
	vaultHandler := vault.NewVaultHandler(database)
	recordsHandler := records.NewRecordsHandler(database, vaultHandler)

	app := &App{
		DB:             database,
		AuthHandler:    authHandler,
		VaultHandler:   vaultHandler,
		RecordsHandler: recordsHandler,
		Router:         chi.NewRouter(),
	}

	// 4. Global middlewares
	app.Router.Use(chiMiddleware.Logger)
	app.Router.Use(chiMiddleware.Recoverer)
	app.Router.Use(middleware.SecurityHeadersMiddleware)
	app.Router.Use(authHandler.AuthenticateMiddleware) // Inject user & csrf into context
	app.Router.Use(middleware.CSRFMiddleware)          // Enforce CSRF on state changes

	// Rate limiters for auth endpoints
	authLimiter := middleware.NewRateLimiter(1.0, 5.0) // 1 request per second, burst of 5

	// 5. Routes
	// Health & Version
	app.Router.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	app.Router.Get("/api/version", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"version": "0.1.0"})
	})

	app.Router.Get("/api/auth/registration-status", authHandler.GetRegistrationStatus)

	// Auth group
	app.Router.Group(func(r chi.Router) {
		r.Use(authLimiter.Limit)
		r.Post("/api/auth/register", authHandler.Register)
		r.Post("/api/auth/login", authHandler.Login)
	})

	app.Router.Post("/api/auth/logout", authHandler.Logout)
	app.Router.Get("/api/auth/me", authHandler.Me)
	app.Router.Post("/api/auth/recovery/rewrap-private-key", authHandler.CompleteResetOrRewrap)
	app.Router.Get("/api/users/{username}/public-key", authHandler.GetUserPublicKey)

	// Vaults group
	app.Router.Get("/api/vaults", vaultHandler.ListVaults)
	app.Router.Post("/api/vaults", vaultHandler.CreateVault)
	app.Router.Get("/api/vaults/{id}", vaultHandler.GetVault)
	app.Router.Delete("/api/vaults/{id}", vaultHandler.DeleteVault)
	app.Router.Get("/api/vaults/{id}/members", vaultHandler.ListMembers)
	app.Router.Post("/api/vaults/{id}/members", vaultHandler.AddMember)
	app.Router.Patch("/api/vaults/{id}/members/{userId}", vaultHandler.UpdateMember)
	app.Router.Delete("/api/vaults/{id}/members/{userId}", vaultHandler.RemoveMember)

	// Encrypted records group
	app.Router.Get("/api/vaults/{id}/records", recordsHandler.ListRecords)
	app.Router.Post("/api/vaults/{id}/records", recordsHandler.CreateRecord)
	app.Router.Put("/api/vaults/{id}/records/{recordId}", recordsHandler.UpdateRecord)
	app.Router.Delete("/api/vaults/{id}/records/{recordId}", recordsHandler.DeleteRecord)

	// Admin group
	app.Router.Group(func(r chi.Router) {
		r.Get("/api/admin/stats", authHandler.AdminGetStats)
		r.Get("/api/admin/users", authHandler.AdminGetUsers)
		r.Post("/api/admin/users/{id}/disable", func(w http.ResponseWriter, r *http.Request) {
			rctx := chi.RouteContext(r.Context())
			rctx.URLParams.Add("action", "disable")
			authHandler.AdminToggleUser(w, r)
		})
		r.Post("/api/admin/users/{id}/enable", func(w http.ResponseWriter, r *http.Request) {
			rctx := chi.RouteContext(r.Context())
			rctx.URLParams.Add("action", "enable")
			authHandler.AdminToggleUser(w, r)
		})
		r.Post("/api/admin/users/{id}/reset-password", authHandler.AdminResetUserPassword)
		r.Get("/api/admin/settings", authHandler.AdminGetSettings)
		r.Post("/api/admin/settings/registration", authHandler.AdminSetRegistration)
	})

	// Resolve frontend assets directory path
	frontendPath := os.Getenv("KOALAFINANCE_FRONTEND_PATH")
	if frontendPath == "" {
		// Check standard paths
		paths := []string{
			"./frontend/dist",
			"../frontend/dist",
			"./dist",
		}
		for _, p := range paths {
			if _, err := os.Stat(filepath.Join(p, "index.html")); err == nil {
				frontendPath = p
				break
			}
		}
		if frontendPath == "" {
			frontendPath = "./frontend/dist" // fallback default
		}
	}
	log.Printf("Serving frontend static assets from: %s", frontendPath)

	distDir := http.Dir(frontendPath)
	fileServer := http.FileServer(distDir)

	app.Router.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		// If it's an API route that fell through, return 404 instead of SPA fallback
		if strings.HasPrefix(path, "/api/") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte(`{"error":"API endpoint not found"}`))
			return
		}
		// If path does not have an extension, fall back to index.html (SPA routing)
		if !strings.Contains(filepath.Base(path), ".") {
			http.ServeFile(w, r, filepath.Join(frontendPath, "index.html"))
			return
		}
		fileServer.ServeHTTP(w, r)
	})

	log.Printf("Starting KoalaFinance server on port %s...", port)
	err = http.ListenAndServe(":"+port, app.Router)
	if err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
