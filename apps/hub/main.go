// Wiki Hub: PC에서만 도는 Sagwan Engine 관리 프로그램.
// 127.0.0.1 전용 서버 + 브라우저 앱 창(Chrome 우선, 없으면 Edge). 외부로 나가는 것은 GitHub 릴리스 조회와 (다음 단계의) wrangler 배포 명령뿐이다.
package main

import (
	"crypto/rand"
	"crypto/subtle"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync/atomic"
	"time"
)

// 빌드 때 -ldflags "-X main.version=0.1.0 -X main.repo=zun479/Sagwan-engine" 로 채운다.
var (
	version = "dev"
	repo    = "zun479/Sagwan-engine"
)

//go:embed ui
var uiFS embed.FS

type server struct {
	store    *Store
	token    string
	host     string
	lastPing atomic.Int64
	releases releaseCache
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// guard: DNS 리바인딩(다른 사이트가 127.0.0.1을 자기 도메인으로 위장)과 CSRF를 막는다.
// Host 헤더가 정확히 우리 주소여야 하고, API는 실행할 때마다 새로 만든 토큰을 요구한다.
func (s *server) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != s.host {
			fail(w, http.StatusForbidden, "bad host")
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			got := r.Header.Get("X-Hub-Token")
			if subtle.ConstantTimeCompare([]byte(got), []byte(s.token)) != 1 {
				fail(w, http.StatusUnauthorized, "bad token")
				return
			}
			s.lastPing.Store(time.Now().Unix())
		}
		next.ServeHTTP(w, r)
	})
}

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func validHTTPURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != "" && u.User == nil
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	sub, _ := fs.Sub(uiFS, "ui")
	mux.Handle("GET /", http.FileServerFS(sub))

	mux.HandleFunc("GET /api/state", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"version": version, "repo": repo, "state": s.store.Get()})
	})

	mux.HandleFunc("POST /api/ping", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]bool{"ok": true})
	})

	mux.HandleFunc("PUT /api/infra", func(w http.ResponseWriter, r *http.Request) {
		var b InfraBlock
		if err := json.NewDecoder(io.LimitReader(r.Body, 16<<10)).Decode(&b); err != nil {
			fail(w, 400, "잘못된 입력입니다.")
			return
		}
		b.Name = strings.TrimSpace(b.Name)
		if b.Name == "" || len([]rune(b.Name)) > 40 {
			fail(w, 400, "이름은 1~40자여야 합니다.")
			return
		}
		if b.URL != "" && !validHTTPURL(b.URL) {
			fail(w, 400, "주소는 http(s)://로 시작해야 합니다.")
			return
		}
		if b.Expires != "" {
			if _, err := time.Parse("2006-01-02", b.Expires); err != nil || !dateRe.MatchString(b.Expires) {
				fail(w, 400, "만료일 형식이 잘못되었습니다.")
				return
			}
		}
		st, err := s.store.Update(func(st *State) error {
			if b.ID == "" {
				b.ID = randomHex(6)
				st.Infra = append(st.Infra, b)
				return nil
			}
			for i := range st.Infra {
				if st.Infra[i].ID == b.ID {
					st.Infra[i] = b
					return nil
				}
			}
			return errors.New("없는 블록입니다.")
		})
		if err != nil {
			fail(w, 400, err.Error())
			return
		}
		writeJSON(w, 200, st)
	})

	mux.HandleFunc("DELETE /api/infra/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		st, err := s.store.Update(func(st *State) error {
			out := st.Infra[:0]
			for _, b := range st.Infra {
				if b.ID != id {
					out = append(out, b)
				}
			}
			st.Infra = out
			return nil
		})
		if err != nil {
			fail(w, 500, "저장하지 못했습니다.")
			return
		}
		writeJSON(w, 200, st)
	})

	mux.HandleFunc("POST /api/infra/order", func(w http.ResponseWriter, r *http.Request) {
		var ids []string
		if err := json.NewDecoder(io.LimitReader(r.Body, 16<<10)).Decode(&ids); err != nil {
			fail(w, 400, "잘못된 입력입니다.")
			return
		}
		st, err := s.store.Update(func(st *State) error {
			pos := map[string]int{}
			for i, id := range ids {
				pos[id] = i
			}
			sorted := make([]InfraBlock, len(st.Infra))
			copy(sorted, st.Infra)
			for i := 1; i < len(sorted); i++ { // 작은 목록이라 삽입 정렬
				for j := i; j > 0 && pos[sorted[j].ID] < pos[sorted[j-1].ID]; j-- {
					sorted[j], sorted[j-1] = sorted[j-1], sorted[j]
				}
			}
			st.Infra = sorted
			return nil
		})
		if err != nil {
			fail(w, 500, "저장하지 못했습니다.")
			return
		}
		writeJSON(w, 200, st)
	})

	// 블록 좌클릭: 서비스 사이트를 사용자의 기본 브라우저(로그인된 쪽)로 연다.
	mux.HandleFunc("POST /api/open", func(w http.ResponseWriter, r *http.Request) {
		var b struct{ URL string }
		if err := json.NewDecoder(io.LimitReader(r.Body, 4<<10)).Decode(&b); err != nil || !validHTTPURL(b.URL) {
			fail(w, 400, "열 수 없는 주소입니다.")
			return
		}
		if err := openDefaultBrowser(b.URL); err != nil {
			fail(w, 500, "브라우저를 열지 못했습니다.")
			return
		}
		writeJSON(w, 200, map[string]bool{"ok": true})
	})

	mux.HandleFunc("GET /api/releases", func(w http.ResponseWriter, r *http.Request) {
		rel, err := s.releases.get(repo)
		if err != nil {
			fail(w, 502, "GitHub에서 버전 목록을 가져오지 못했습니다. 인터넷 연결을 확인하세요.")
			return
		}
		writeJSON(w, 200, rel)
	})

	return s.guard(mux)
}

func main() {
	noWindow := flag.Bool("no-window", false, "창을 띄우지 않고 주소만 출력 (개발용)")
	port := flag.Int("port", 0, "포트 (0이면 임의)")
	flag.Parse()

	dir, err := dataDir()
	if err != nil {
		log.Fatal(err)
	}
	_ = os.MkdirAll(dir, 0o700)
	logf, _ := os.OpenFile(filepath.Join(dir, "hub.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if logf != nil {
		log.SetOutput(io.MultiWriter(os.Stderr, logf))
	}

	store, err := OpenStore()
	if err != nil {
		log.Fatal(err)
	}
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		log.Fatal(err)
	}
	s := &server{store: store, token: randomHex(24), host: ln.Addr().String()}
	s.lastPing.Store(time.Now().Unix())

	// 토큰은 URL 조각(#)으로만 넘긴다: 서버 요청·기록에 남지 않는다.
	appURL := fmt.Sprintf("http://%s/#%s", s.host, s.token)
	srv := &http.Server{Handler: s.routes(), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	log.Printf("Wiki Hub %s 시작 (%s)", version, s.host)

	if *noWindow {
		fmt.Println(appURL)
	} else if _, err := openAppWindow(appURL, filepath.Join(dir, "window")); err != nil {
		log.Printf("창을 열지 못함: %v", err)
	}

	// 창이 닫히면(화면이 5초마다 보내는 신호가 끊기면) 스스로 종료한다.
	for {
		time.Sleep(5 * time.Second)
		if !*noWindow && time.Now().Unix()-s.lastPing.Load() > 20 {
			log.Printf("창이 닫혀 종료합니다.")
			_ = srv.Close()
			return
		}
	}
}
