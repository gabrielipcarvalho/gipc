package waf

import (
	"strings"
	"testing"
)

func hasCat(fs []Finding, c Category) bool {
	for _, f := range fs {
		if f.Category == c {
			return true
		}
	}
	return false
}

func TestEngineMatchesEachCategory(t *testing.T) {
	e := NewEngine()
	cases := []struct {
		name string
		r    Request
		cat  Category
	}{
		{"traversal-literal", Request{Path: "/api/x", Query: "f=../../etc/passwd"}, CatTraversal},
		{"traversal-encoded", Request{Path: "/api/x", Query: "f=%2e%2e%2fetc"}, CatTraversal},
		{"sqli-orequals", Request{Path: "/api/x", Query: "id=1' or '1'='1"}, CatSQLi},
		{"sqli-union", Request{Path: "/api/x", Query: "q=1 union select 1"}, CatSQLi},
		{"xss-script", Request{Path: "/api/x", Query: "q=<script>alert(1)</script>"}, CatXSS},
		{"xss-img-onerror", Request{Path: "/api/x", Query: "q=<img src=x onerror=1>"}, CatXSS},
		{"rce-subshell", Request{Path: "/api/x", Query: "q=$(id)"}, CatRCE},
		{"scanner-ua", Request{Path: "/api/x", UserAgent: "sqlmap/1.5.2"}, CatScanner},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if !hasCat(e.Inspect(c.r), c.cat) {
				t.Fatalf("expected %s finding for %+v, got %+v", c.cat, c.r, e.Inspect(c.r))
			}
		})
	}
}

// TestWAFLegitCorpusZeroFindings is the load-bearing false-positive guard: every real core /api/* request
// (structured int/base64url/enum queries) crossed with normal + bot UAs must produce ZERO findings.
func TestWAFLegitCorpusZeroFindings(t *testing.T) {
	e := NewEngine()
	reqs := []Request{
		{Method: "GET", Path: "/api/status"},
		{Method: "GET", Path: "/api/topology"},
		{Method: "GET", Path: "/api/deploys"},
		{Method: "GET", Path: "/api/uptime"},
		{Method: "GET", Path: "/api/version"},
		{Method: "GET", Path: "/api/metrics/history"},
		{Method: "GET", Path: "/api/logs"},
		{Method: "GET", Path: "/api/logs/volume"},
		{Method: "GET", Path: "/api/metrics/deep"},
		{Method: "GET", Path: "/api/trace"},
		{Method: "GET", Path: "/api/lab/chaos/status"},
		{Method: "GET", Path: "/api/lab/ratelimit"},
		{Method: "GET", Path: "/api/lab/db/queries"},
		{Method: "GET", Path: "/api/lab/demo/events", Query: "limit=25&cursor=MjU"}, // base64url("25")
		{Method: "GET", Path: "/api/lab/loadtest", Query: "c=8&s=5"},
		{Method: "GET", Path: "/api/lab/waf/probe", Query: "sample=hello"},
		{Method: "POST", Path: "/api/lab/shell"},
		{Method: "POST", Path: "/api/lab/db/run"},
		{Method: "POST", Path: "/api/lab/chaos"},
		{Method: "POST", Path: "/api/lab/demo/token"},
	}
	uas := []string{
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
		"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
		"curl/8.4.0",
		"",
	}
	for _, r := range reqs {
		for _, ua := range uas {
			r.UserAgent = ua
			if f := e.Inspect(r); len(f) != 0 {
				t.Fatalf("legit request %s?%s UA=%q flagged: %+v", r.Path, r.Query, ua, f)
			}
		}
	}
}

func TestEngineDoubleEncodedTraversal(t *testing.T) {
	e := NewEngine()
	// %252e%252e = double-encoded ".." → QueryUnescape once yields %2e%2e, matched by the %2e%2e needle.
	if !hasCat(e.Inspect(Request{Path: "/api/x", Query: "f=%252e%252e%252fetc%252fpasswd"}), CatTraversal) {
		t.Fatal("double-encoded traversal must be caught")
	}
}

func TestEngineCaseInsensitive(t *testing.T) {
	e := NewEngine()
	if !hasCat(e.Inspect(Request{Path: "/api/x", Query: "q=<SCRIPT>alert(1)</SCRIPT>"}), CatXSS) {
		t.Fatal("uppercase <SCRIPT> must match")
	}
	if !hasCat(e.Inspect(Request{Path: "/x", UserAgent: "SQLMap/1.0"}), CatScanner) {
		t.Fatal("uppercase SQLMap UA must match")
	}
}

func TestEngineAnchoredNoFalsePositive(t *testing.T) {
	e := NewEngine()
	// ";identity" must NOT trip the rce ";id;" / "; id" needles.
	if f := e.Inspect(Request{Path: "/api/x", Query: "type=;identity"}); hasCat(f, CatRCE) {
		t.Fatalf(";identity should not match rce: %+v", f)
	}
	// "nmap" embedded without a delimiter (e.g. "unmapper") must NOT trip scanner-ua.
	if f := e.Inspect(Request{Path: "/x", UserAgent: "libunmapper/1.0"}); hasCat(f, CatScanner) {
		t.Fatalf("unmapper should not match scanner-ua: %+v", f)
	}
}

func TestEngineBlockEligibility(t *testing.T) {
	e := NewEngine()
	trav := e.Inspect(Request{Path: "/x", Query: "f=../etc/passwd"})
	if len(trav) == 0 || !trav[0].Block {
		t.Fatalf("traversal must be Block-eligible: %+v", trav)
	}
	sqli := e.Inspect(Request{Path: "/x", Query: "q=1 union select 1"})
	if len(sqli) == 0 || sqli[0].Block {
		t.Fatalf("sqli must NOT be Block-eligible (monitor-only): %+v", sqli)
	}
}

func TestEngineAdversarialInputNoPanic(t *testing.T) {
	e := NewEngine()
	inputs := []Request{
		{},
		{Path: "/x", Query: strings.Repeat("A", 100000)},
		{Path: "/x", Query: "%"},            // bare % → QueryUnescape errors → fallback to raw
		{Path: "/x", Query: "%zz%"},         // invalid escape
		{Path: "/x", Query: "\x00\xff\xfe"}, // invalid utf-8
		{Path: "?", Query: "?"},
		{Path: "/x", Query: "a=%2e%2e", UserAgent: strings.Repeat("u", 100000)},
	}
	for _, r := range inputs {
		_ = e.Inspect(r) // must not panic
	}
}
