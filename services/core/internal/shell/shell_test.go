package shell

import (
	"go/parser"
	"go/token"
	"os"
	"strings"
	"testing"
)

// TestNoDangerousImports is the CAPABILITY PROOF: internal/shell production code may import ONLY the pure
// allowlist. A future `os`/`os/exec`/`syscall`/`net`/`database/sql`/`path/filepath`/`unsafe` import fails the
// build here, so the package can never gain the ability to exec, exfil env/secrets, run SQL, or touch the
// real FS/network. Scans production .go only (excludes _test.go — this file legitimately imports go/parser+os).
func TestNoDangerousImports(t *testing.T) {
	allowed := map[string]struct{}{"fmt": {}, "path": {}, "sort": {}, "strings": {}, "time": {}, "strconv": {}}
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatal(err)
	}
	scanned := 0
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		scanned++
		fset := token.NewFileSet()
		f, err := parser.ParseFile(fset, name, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatalf("parse %s: %v", name, err)
		}
		for _, imp := range f.Imports {
			p := strings.Trim(imp.Path.Value, `"`)
			if _, ok := allowed[p]; !ok {
				t.Errorf("%s imports forbidden %q — internal/shell must stay capability-free (no os/exec/syscall/net/sql/filesystem)", name, p)
			}
		}
	}
	if scanned == 0 {
		t.Fatal("guard scanned 0 production files — the capability proof is vacuous")
	}
}

func TestUnknownCommandNeverExecutes(t *testing.T) {
	for _, in := range []string{"rm -rf /", ";id", "$(whoami)", "`id`", "a && b", "env", "printenv", "sh", "eval x", "os.Getenv"} {
		r := Execute(in, "/")
		first := strings.Fields(in)[0]
		if r.Output != "command not found: "+first+"\n" {
			t.Errorf("%q → %q; want command-not-found for %q", in, r.Output, first)
		}
	}
}

func TestEmptyAndWhitespace(t *testing.T) {
	for _, in := range []string{"", "   ", "\t \n"} {
		if r := Execute(in, "/"); r.Output != "" {
			t.Errorf("%q → %q; want empty", in, r.Output)
		}
	}
}

func TestKnownCommands(t *testing.T) {
	if r := Execute("whoami", "/"); r.Output != "visitor@gipc.dev\n" {
		t.Errorf("whoami → %q", r.Output)
	}
	if r := Execute("echo hello  world", "/"); r.Output != "hello world\n" {
		t.Errorf("echo → %q", r.Output)
	}
	if r := Execute("help", "/"); !strings.Contains(r.Output, "commands:") || !strings.Contains(r.Output, "whoami") {
		t.Errorf("help → %q", r.Output)
	}
	if r := Execute("clear", "/lab"); !r.Cleared || r.Cwd != "/lab" {
		t.Errorf("clear → %+v", r)
	}
	if r := Execute("date", "/"); !strings.HasSuffix(r.Output, "\n") || len(r.Output) < 10 {
		t.Errorf("date → %q", r.Output)
	}
}

func TestFSContainmentNoRealFS(t *testing.T) {
	for _, in := range []string{
		"cat ../../../../etc/passwd", "cat /proc/self/environ", "cat /etc/shadow",
		"cat ./////proc/self/environ", "cat /../secret",
	} {
		r := Execute(in, "/")
		if !strings.Contains(r.Output, "no such file") {
			t.Errorf("%q → %q; want no-such-file (never a real read)", in, r.Output)
		}
	}
	// cd above root clamps to "/"
	if r := Execute("cd /..", "/"); r.Cwd != "/" {
		t.Errorf("cd /.. → cwd %q; want /", r.Cwd)
	}
}

func TestIsDirDiscrimination(t *testing.T) {
	if r := Execute("cd /about.txt", "/"); !strings.Contains(r.Output, "not a directory") {
		t.Errorf("cd into file → %q", r.Output)
	}
	if r := Execute("cat /etc", "/"); !strings.Contains(r.Output, "is a directory") {
		t.Errorf("cat a dir → %q", r.Output)
	}
}

func TestCwdRoundTrip(t *testing.T) {
	r := Execute("cd lab", "/")
	if r.Cwd != "/lab" {
		t.Fatalf("cd lab → cwd %q; want /lab", r.Cwd)
	}
	if r2 := Execute("ls", r.Cwd); !strings.Contains(r2.Output, "readme.txt") {
		t.Errorf("ls in %q → %q; want readme.txt", r.Cwd, r2.Output)
	}
	if r3 := Execute("cat readme.txt", r.Cwd); !strings.Contains(r3.Output, "safe-by-construction") {
		t.Errorf("cat relative in /lab → %q", r3.Output)
	}
}

func TestCwdNormalized(t *testing.T) {
	for _, bad := range []string{"garbage", "relative/path", "/nonexistent", "/about.txt", ""} {
		if r := Execute("pwd", bad); r.Output != "/\n" {
			t.Errorf("pwd with cwd %q → %q; want / (normalized)", bad, r.Output)
		}
	}
}

func TestDeterministicOutput(t *testing.T) {
	for _, cmd := range []string{"help", "ls /", "tree"} {
		if a, b := Execute(cmd, "/").Output, Execute(cmd, "/").Output; a != b {
			t.Errorf("%q non-deterministic:\n%q\nvs\n%q", cmd, a, b)
		}
	}
}

func TestTruncate(t *testing.T) {
	big := strings.Repeat("x", MaxOutput+100)
	got := truncate(big)
	if len(got) <= MaxOutput || !strings.HasSuffix(got, "truncated]\n") {
		t.Errorf("truncate len=%d suffix=%q", len(got), got[len(got)-15:])
	}
	if truncate("small") != "small" {
		t.Error("truncate altered a short string")
	}
}

func TestCdNoArgsLsFileCatMissing(t *testing.T) {
	if r := Execute("cd", "/lab"); r.Cwd != "/" {
		t.Errorf("cd no-args → %q; want /", r.Cwd)
	}
	if r := Execute("ls about.txt", "/"); r.Output != "about.txt\n" {
		t.Errorf("ls file → %q; want basename", r.Output)
	}
	if r := Execute("cat", "/"); !strings.Contains(r.Output, "missing operand") {
		t.Errorf("cat no-arg → %q", r.Output)
	}
}

func TestFSContentIsPublicLiteral(t *testing.T) {
	// the import guard proves no content is sourced from a file/env; sanity-check the literals are honest.
	if !strings.Contains(fs["/about.txt"].content, "gipc.dev") || !strings.Contains(fs["/etc/motd"].content, "sandbox") {
		t.Error("fs literals drifted from expected public content")
	}
}
