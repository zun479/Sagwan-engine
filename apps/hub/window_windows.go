//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

// findBrowser는 앱 모드를 지원하는 브라우저를 찾는다. Chrome이 있으면 Chrome, 없으면 Edge(Windows 기본 탑재).
func findBrowser() string {
	candidates := [][]string{
		{"ProgramFiles", "Google", "Chrome", "Application", "chrome.exe"},
		{"ProgramFiles(x86)", "Google", "Chrome", "Application", "chrome.exe"},
		{"LOCALAPPDATA", "Google", "Chrome", "Application", "chrome.exe"},
		{"ProgramFiles(x86)", "Microsoft", "Edge", "Application", "msedge.exe"},
		{"ProgramFiles", "Microsoft", "Edge", "Application", "msedge.exe"},
	}
	for _, c := range candidates {
		base := os.Getenv(c[0])
		if base == "" {
			continue
		}
		p := filepath.Join(append([]string{base}, c[1:]...)...)
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// openAppWindow는 브라우저의 앱 모드(주소창·탭 없는 창)로 Hub 화면을 연다.
// Hub 전용 프로필을 써서 평소 쓰는 브라우저의 탭·로그인과 섞이지 않는다.
func openAppWindow(url, profileDir string) (*exec.Cmd, error) {
	browser := findBrowser()
	if browser == "" {
		return nil, openDefaultBrowser(url)
	}
	cmd := exec.Command(browser, "--app="+url, "--user-data-dir="+profileDir, "--window-size=1180,760", "--no-first-run", "--no-default-browser-check")
	return cmd, cmd.Start()
}

func openDefaultBrowser(url string) error {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Start()
}
