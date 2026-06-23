package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

func main() {
	port := "9090"
	dbPath := "./smoke_test.db"

	// Clean up any old db
	os.Remove(dbPath)
	defer os.Remove(dbPath)

	fmt.Println("🐨 Starting KoalaFinance smoke test...")

	// 1. Build and run backend server in background
	cmd := exec.Command("go", "run", "./cmd/koalafinance/main.go")
	cmd.Env = append(os.Environ(),
		"KOALAFINANCE_PORT="+port,
		"KOALAFINANCE_DATABASE_PATH="+dbPath,
		"KOALAFINANCE_ADMIN_USERNAME=admin@local.test",
		"KOALAFINANCE_ADMIN_PASSWORD=adminPassword123",
	)

	// Suppress output of background server unless needed
	serverErrLog, err := os.CreateTemp("", "koalafinance-smoke-err")
	if err == nil {
		cmd.Stderr = serverErrLog
		defer os.Remove(serverErrLog.Name())
	}

	err = cmd.Start()
	if err != nil {
		fmt.Printf("❌ Failed to start server: %v\n", err)
		os.Exit(1)
	}

	// Make sure we kill the server on exit
	defer func() {
		fmt.Println("Stopping backend server...")
		_ = cmd.Process.Kill()
	}()

	// Wait for server to boot
	fmt.Println("Waiting 1.5 seconds for server to boot...")
	time.Sleep(1500 * time.Millisecond)

	baseURL := "http://localhost:" + port

	// 2. Verify /api/health
	fmt.Print("Verifying /api/health... ")
	resp, err := http.Get(baseURL + "/api/health")
	if err != nil {
		fmt.Printf("❌ FAIL: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		fmt.Printf("❌ FAIL: status code %d\n", resp.StatusCode)
		os.Exit(1)
	}
	var health map[string]string
	_ = json.NewDecoder(resp.Body).Decode(&health)
	if health["status"] != "ok" {
		fmt.Printf("❌ FAIL: response %+v\n", health)
		os.Exit(1)
	}
	fmt.Println("✅ PASS")

	// 3. Verify /api/version
	fmt.Print("Verifying /api/version... ")
	respVer, err := http.Get(baseURL + "/api/version")
	if err != nil {
		fmt.Printf("❌ FAIL: %v\n", err)
		os.Exit(1)
	}
	defer respVer.Body.Close()
	var ver map[string]string
	_ = json.NewDecoder(respVer.Body).Decode(&ver)
	if ver["version"] != "0.1.0" {
		fmt.Printf("❌ FAIL: response %+v\n", ver)
		os.Exit(1)
	}
	fmt.Println("✅ PASS")

	// 4. Verify static frontend route returns HTML
	fmt.Print("Verifying static frontend root serves index.html... ")
	respRoot, err := http.Get(baseURL + "/")
	if err != nil {
		fmt.Printf("❌ FAIL: %v\n", err)
		os.Exit(1)
	}
	defer respRoot.Body.Close()
	bodyBytes, _ := io.ReadAll(respRoot.Body)
	bodyStr := string(bodyBytes)
	if !strings.Contains(bodyStr, "<!DOCTYPE html>") && !strings.Contains(bodyStr, "KoalaFinance") {
		fmt.Printf("❌ FAIL: response did not look like HTML:\n%s\n", bodyStr)
		os.Exit(1)
	}
	// Verify CSP Header
	csp := respRoot.Header.Get("Content-Security-Policy")
	if csp == "" {
		fmt.Println("❌ FAIL: missing Content-Security-Policy header")
		os.Exit(1)
	}
	fmt.Println("✅ PASS (Headers: CSP is set)")

	// 5. Verify SPA Routing (non-file routes fallback to index.html)
	fmt.Print("Verifying SPA route fallback (/dashboard) serves index.html... ")
	respSPA, err := http.Get(baseURL + "/dashboard")
	if err != nil {
		fmt.Printf("❌ FAIL: %v\n", err)
		os.Exit(1)
	}
	defer respSPA.Body.Close()
	bodySPABytes, _ := io.ReadAll(respSPA.Body)
	bodySPAStr := string(bodySPABytes)
	if !strings.Contains(bodySPAStr, "<!DOCTYPE html>") {
		fmt.Printf("❌ FAIL: SPA route fallback did not return HTML\n")
		os.Exit(1)
	}
	fmt.Println("✅ PASS")

	// 6. Verify API 404 is NOT swallowed by the SPA fallback
	fmt.Print("Verifying invalid API path (/api/auth/doesnotexist) returns 404... ")
	resp404, err := http.Get(baseURL + "/api/auth/doesnotexist")
	if err != nil {
		fmt.Printf("❌ FAIL: %v\n", err)
		os.Exit(1)
	}
	defer resp404.Body.Close()
	if resp404.StatusCode != http.StatusNotFound {
		fmt.Printf("❌ FAIL: expected 404, got %d\n", resp404.StatusCode)
		os.Exit(1)
	}
	fmt.Println("✅ PASS")

	fmt.Println("\n🎉 SMOKE TEST SUCCESSFUL! Foundations are solid and correct.")
}
