//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func findEdge() string {
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"} {
		p := filepath.Join(os.Getenv(env), "Microsoft", "Edge", "Application", "msedge.exe")
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// openAppWindow는 Edge 앱 모드(주소창 없는 창)로 Hub 화면을 연다. 전용 프로필을 써서 사용자 브라우저와 섞이지 않는다.
func openAppWindow(url, profileDir string) (*exec.Cmd, error) {
	edge := findEdge()
	if edge == "" {
		return nil, openDefaultBrowser(url)
	}
	cmd := exec.Command(edge, "--app="+url, "--user-data-dir="+profileDir, "--window-size=1180,760", "--no-first-run", "--no-default-browser-check")
	return cmd, cmd.Start()
}

func openDefaultBrowser(url string) error {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Start()
}
