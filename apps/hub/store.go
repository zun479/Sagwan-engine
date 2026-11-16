package main

// Hub가 PC에 남기는 것은 인프라 블록 정보(이름·주소·만료일)와 위키 목록뿐이다.
// 비밀번호·API 키·위키 데이터는 저장하지 않는다.

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

type InfraBlock struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`      // cloudflare, ncp, oracle, domain, other ...
	URL       string `json:"url"`       // 좌클릭 시 여는 서비스 관리 페이지
	Expires   string `json:"expires"`   // YYYY-MM-DD, 비면 "만료일 지정되지 않음"
	AutoRenew bool   `json:"autoRenew"` // 자동 연장
}

type Wiki struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	URL           string `json:"url"`
	EngineVersion string `json:"engineVersion"`
}

type State struct {
	Version int          `json:"version"`
	Infra   []InfraBlock `json:"infra"`
	Wikis   []Wiki       `json:"wikis"`
}

type Store struct {
	mu   sync.Mutex
	path string
	st   State
}

func dataDir() (string, error) {
	base, err := os.UserConfigDir() // Windows: %APPDATA%
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "WikiHub"), nil
}

func OpenStore() (*Store, error) {
	dir, err := dataDir()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	s := &Store{path: filepath.Join(dir, "hub.json"), st: State{Version: 1, Infra: []InfraBlock{}, Wikis: []Wiki{}}}
	b, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(b, &s.st); err != nil {
		// 손상된 파일은 옆에 보관하고 새로 시작
		_ = os.Rename(s.path, s.path+".broken")
		s.st = State{Version: 1, Infra: []InfraBlock{}, Wikis: []Wiki{}}
	}
	if s.st.Infra == nil {
		s.st.Infra = []InfraBlock{}
	}
	if s.st.Wikis == nil {
		s.st.Wikis = []Wiki{}
	}
	return s, nil
}

func (s *Store) Get() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.st
}

// Update는 바꾼 뒤 임시 파일에 쓰고 이름을 바꿔 원자적으로 저장한다.
func (s *Store) Update(fn func(*State) error) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := s.st
	next.Infra = append([]InfraBlock(nil), s.st.Infra...)
	next.Wikis = append([]Wiki(nil), s.st.Wikis...)
	if err := fn(&next); err != nil {
		return s.st, err
	}
	b, err := json.MarshalIndent(next, "", "  ")
	if err != nil {
		return s.st, err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return s.st, err
	}
	if err := os.Rename(tmp, s.path); err != nil {
		return s.st, err
	}
	s.st = next
	return next, nil
}
