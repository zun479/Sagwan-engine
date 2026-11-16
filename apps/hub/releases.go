package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type ReleaseAsset struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
	URL  string `json:"url"`
}

type Release struct {
	Tag        string         `json:"tag"`
	Name       string         `json:"name"`
	Body       string         `json:"body"`
	Published  string         `json:"published"`
	Prerelease bool           `json:"prerelease"`
	Page       string         `json:"page"`
	Assets     []ReleaseAsset `json:"assets"`
}

// GitHub API는 인증 없이 시간당 60회 제한이라 10분 동안 캐시한다.
type releaseCache struct {
	mu   sync.Mutex
	at   time.Time
	data []Release
}

func (c *releaseCache) get(repo string) ([]Release, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.data != nil && time.Since(c.at) < 10*time.Minute {
		return c.data, nil
	}
	req, _ := http.NewRequest("GET", fmt.Sprintf("https://api.github.com/repos/%s/releases?per_page=30", repo), nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "WikiHub/"+version)
	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("github status %d", res.StatusCode)
	}
	var raw []struct {
		TagName     string `json:"tag_name"`
		Name        string `json:"name"`
		Body        string `json:"body"`
		PublishedAt string `json:"published_at"`
		Prerelease  bool   `json:"prerelease"`
		Draft       bool   `json:"draft"`
		HTMLURL     string `json:"html_url"`
		Assets      []struct {
			Name string `json:"name"`
			Size int64  `json:"size"`
			URL  string `json:"browser_download_url"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return nil, err
	}
	out := []Release{}
	for _, r := range raw {
		if r.Draft {
			continue
		}
		rel := Release{Tag: r.TagName, Name: r.Name, Body: r.Body, Published: r.PublishedAt, Prerelease: r.Prerelease, Page: r.HTMLURL, Assets: []ReleaseAsset{}}
		for _, a := range r.Assets {
			rel.Assets = append(rel.Assets, ReleaseAsset{Name: a.Name, Size: a.Size, URL: a.URL})
		}
		out = append(out, rel)
	}
	c.data, c.at = out, time.Now()
	return out, nil
}
