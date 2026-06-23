package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// SecurityHeadersMiddleware adds standard security hardening headers to all responses
func SecurityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Strict Content Security Policy - no unsafe-inline, no external CDNs
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; object-src 'none'; base-uri 'self';")

		// Prevent MIME type sniffing
		w.Header().Set("X-Content-Type-Options", "nosniff")

		// Restrict referrer information
		w.Header().Set("Referrer-Policy", "no-referrer")

		// Prevent frame embedding (clickjacking)
		w.Header().Set("X-Frame-Options", "DENY")

		// Disable unnecessary browser features
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")

		next.ServeHTTP(w, r)
	})
}

// CSRFMiddleware checks state-changing mutations for a session-bound CSRF token
func CSRFMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check only for state-changing methods
		method := r.Method
		if method == "POST" || method == "PUT" || method == "PATCH" || method == "DELETE" {
			// Get CSRF secret injected in context by AuthenticateMiddleware
			csrfSecret, ok := r.Context().Value("csrf_secret").(string)
			if !ok || csrfSecret == "" {
				// No session or no csrf secret in session -> reject mutation
				http.Error(w, `{"error":"CSRF token missing or invalid - no session"}`, http.StatusForbidden)
				return
			}

			// Get the CSRF token from request headers
			requestToken := r.Header.Get("X-CSRF-Token")
			if requestToken == "" {
				http.Error(w, `{"error":"CSRF token missing"}`, http.StatusForbidden)
				return
			}

			// Compare request token with session-bound secret
			if requestToken != csrfSecret {
				http.Error(w, `{"error":"CSRF token mismatch"}`, http.StatusForbidden)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// Simple in-memory rate limiter using token bucket pattern per IP
type rateLimiterItem struct {
	tokens     float64
	lastUpdate time.Time
}

type RateLimiter struct {
	mu   sync.Mutex
	ips  map[string]*rateLimiterItem
	rate float64 // tokens per second
	max  float64 // max tokens capacity
}

func NewRateLimiter(rate float64, max float64) *RateLimiter {
	return &RateLimiter{
		ips:  make(map[string]*rateLimiterItem),
		rate: rate,
		max:  max,
	}
}

func (rl *RateLimiter) Limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract client IP address
		ip, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			ip = r.RemoteAddr
		}

		rl.mu.Lock()
		item, exists := rl.ips[ip]
		now := time.Now()

		if !exists {
			item = &rateLimiterItem{
				tokens:     rl.max,
				lastUpdate: now,
			}
			rl.ips[ip] = item
		} else {
			// Refill tokens based on elapsed time
			elapsed := now.Sub(item.lastUpdate).Seconds()
			item.tokens += elapsed * rl.rate
			if item.tokens > rl.max {
				item.tokens = rl.max
			}
			item.lastUpdate = now
		}

		// Consume 1 token
		if item.tokens >= 1.0 {
			item.tokens -= 1.0
			rl.mu.Unlock()
			next.ServeHTTP(w, r)
			return
		}

		rl.mu.Unlock()
		http.Error(w, `{"error":"Too many requests"}`, http.StatusTooManyRequests)
	})
}
