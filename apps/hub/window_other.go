//go:build !windows

package main

import (
	"os/exec"
	"runtime"
)

// 개발용: Windows가 아닌 곳에서는 기본 브라우저로 연다.
func openAppWindow(url, _ string) (*exec.Cmd, error) {
	return nil, openDefaultBrowser(url)
}

func openDefaultBrowser(url string) error {
	name := "xdg-open"
	if runtime.GOOS == "darwin" {
		name = "open"
	}
	return exec.Command(name, url).Start()
}
