package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestServer(t *testing.T) (*server, http.Handler) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("APPDATA", t.TempDir())
	st, err := OpenStore()
	if err != nil {
		t.Fatal(err)
	}
	s := &server{store: st, token: "tok", host: "127.0.0.1:9"}
	return s, s.routes()
}

func do(h http.Handler, method, path, host, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Host = host
	if token != "" {
		req.Header.Set("X-Hub-Token", token)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestGuard(t *testing.T) {
	_, h := newTestServer(t)
	if w := do(h, "GET", "/", "evil.example:9", "", ""); w.Code != 403 {
		t.Fatalf("다른 Host 허용됨: %d", w.Code)
	}
	if w := do(h, "GET", "/api/state", "127.0.0.1:9", "", ""); w.Code != 401 {
		t.Fatalf("토큰 없이 API 허용됨: %d", w.Code)
	}
	if w := do(h, "GET", "/api/state", "127.0.0.1:9", "wrong", ""); w.Code != 401 {
		t.Fatalf("틀린 토큰 허용됨: %d", w.Code)
	}
	if w := do(h, "GET", "/", "127.0.0.1:9", "", ""); w.Code != 200 || !strings.Contains(w.Body.String(), "Wiki Hub") {
		t.Fatalf("화면 안 열림: %d", w.Code)
	}
}

func TestInfraValidationAndPersist(t *testing.T) {
	s, h := newTestServer(t)
	bad := []string{
		`{"name":"","kind":"other"}`,
		`{"name":"x","url":"javascript:alert(1)"}`,
		`{"name":"x","url":"https://user:pw@evil.com"}`,
		`{"name":"x","expires":"2026-13-40"}`,
	}
	for _, b := range bad {
		if w := do(h, "PUT", "/api/infra", "127.0.0.1:9", "tok", b); w.Code != 400 {
			t.Fatalf("잘못된 입력 허용됨 %s: %d", b, w.Code)
		}
	}
	w := do(h, "PUT", "/api/infra", "127.0.0.1:9", "tok", `{"name":"Cloudflare","kind":"cloudflare","url":"https://dash.cloudflare.com/","expires":"2027-01-01"}`)
	if w.Code != 200 {
		t.Fatalf("저장 실패: %d %s", w.Code, w.Body)
	}
	again, err := OpenStore()
	if err != nil || len(again.Get().Infra) != 1 || again.Get().Infra[0].ID == "" {
		t.Fatalf("파일에 남지 않음: %+v %v", again.Get(), err)
	}
	if w := do(h, "POST", "/api/open", "127.0.0.1:9", "tok", `{"URL":"file:///C:/Windows"}`); w.Code != 400 {
		t.Fatalf("http(s) 아닌 주소 열기 허용됨: %d", w.Code)
	}
	_ = s
}
