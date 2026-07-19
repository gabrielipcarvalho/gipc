// Package waf is a pure, dependency-free app-layer WAF rule engine: it matches a redacted request surface
// (method / path / query / user-agent) against a fixed set of known-abuse signatures and returns findings.
//
// It is deliberately a BEST-EFFORT SIGNATURE MONITOR, not a security boundary — trivially bypassable by
// encoding, casing, fragmentation, or moving the payload into a request body (which this engine never
// sees). It holds NO client IP and NO request body, so it cannot leak either. Blocking is a decision the
// caller makes from Finding.Block; this package only flags. Every matcher is a pure strings.ToLower +
// strings.Contains over a length-capped haystack, so Inspect can never panic on hostile input.
package waf

import (
	"net/url"
	"strings"
)

// maxScan bounds the inspected surface so a multi-KB query can't force unbounded matching work per request
// (the middleware runs before the rate limiter). uaScan bounds the user-agent haystack.
const (
	maxScan = 4096
	uaScan  = 512
)

// Category groups findings for the aggregate dashboard.
type Category string

const (
	CatTraversal Category = "path-traversal"
	CatSQLi      Category = "sqli"
	CatXSS       Category = "xss"
	CatRCE       Category = "rce-probe"
	CatScanner   Category = "scanner-ua"
)

// Rule is one signature set. ua rules match the user-agent; the rest match the path+query. Block marks a
// rule as eligible for the caller's optional soft-block (only path-traversal in v1).
type Rule struct {
	ID       string
	Category Category
	Block    bool
	ua       bool
	needles  []string // all lowercase; matched with Contains
}

// Request is the redacted inspection surface. There is NO IP field and NO body — a leak of either is
// therefore structurally impossible.
type Request struct {
	Method    string
	Path      string
	Query     string
	UserAgent string
}

// Finding is one matched rule. JSON tags are explicit camelCase (the dashboard + data/lab.ts depend on it).
type Finding struct {
	RuleID   string   `json:"ruleId"`
	Category Category `json:"category"`
	Block    bool     `json:"block"`
}

// Engine holds the compiled rule set.
type Engine struct{ rules []Rule }

// NewEngine returns the fixed v1 rule set. Signatures are conservative + anchored (leading spaces,
// delimiters) so no legit structured core query can match — see the zero-false-positive corpus test.
func NewEngine() *Engine {
	return &Engine{rules: []Rule{
		{ID: "traversal", Category: CatTraversal, Block: true, needles: []string{
			"../", "..\\", "%2e%2e", "/etc/passwd", "/proc/self", "windows/system32"}},
		{ID: "sqli", Category: CatSQLi, needles: []string{
			" union select", "' or '1'='1", " or 1=1", "; drop table", "xp_cmdshell", "information_schema", "sleep(", "/**/"}},
		{ID: "xss", Category: CatXSS, needles: []string{
			"<script", "javascript:", "onerror=", "onload=", "<img ", "%3cscript"}},
		{ID: "rce", Category: CatRCE, needles: []string{
			";id;", "; id", "$(", "/bin/sh", "wget http", "curl http", "nc -e"}},
		{ID: "scanner", Category: CatScanner, ua: true, needles: []string{
			"sqlmap", "nikto", "nmap/", "nmap ", "masscan", "nuclei", "dirbuster", "gobuster", "havij", "acunetix", "zgrab"}},
	}}
}

func capStr(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

// Inspect runs every rule against the request and returns all matches (at most one per rule). Pure +
// deterministic; ToLower+Contains only over capped haystacks, so it never panics.
func (e *Engine) Inspect(r Request) []Finding {
	raw := capStr(r.Path+"?"+r.Query, maxScan)
	rawLower := strings.ToLower(raw)
	// decode ONCE so single-encoded payloads (%2e%2e, %3cscript) match; keep rawLower so double-encoded
	// payloads (%252e%252e → decodes to %2e%2e, matched by the %2e%2e needle) are also caught.
	decoded := rawLower
	if d, err := url.QueryUnescape(raw); err == nil {
		decoded = strings.ToLower(capStr(d, maxScan))
	}
	ua := strings.ToLower(capStr(r.UserAgent, uaScan))

	var out []Finding
	for _, rule := range e.rules {
		matched := false
		for _, n := range rule.needles {
			if rule.ua {
				matched = strings.Contains(ua, n)
			} else {
				matched = strings.Contains(decoded, n) || strings.Contains(rawLower, n)
			}
			if matched {
				break
			}
		}
		if matched {
			out = append(out, Finding{RuleID: rule.ID, Category: rule.Category, Block: rule.Block})
		}
	}
	return out
}
