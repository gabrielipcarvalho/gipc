// Package shell is the safe sandbox shell's PURE interpreter. It is deliberately isolated in its own
// package with a machine-checked import allowlist (see shell_test.go TestNoDangerousImports): it imports
// ONLY strings/path/fmt/sort/time/strconv, so it PHYSICALLY CANNOT exec a process, read the real
// filesystem, open a socket, run SQL, reach the cluster, or read env/secrets — the package boundary is the
// capability proof. All user text is either matched against a fixed command table or rejected; the
// "filesystem" is a fixed in-memory map, never the real one. The HTTP handler (package server) holds the
// real capabilities and passes this package NOTHING but the raw cmd + cwd strings.
package shell

import (
	"fmt"
	"path"
	"sort"
	"strings"
	"time"
)

// MaxOutput bounds any single command's output (defense against amplification); truncate() enforces it.
const MaxOutput = 8192

// Result is the pure outcome of one command. Cwd is the (possibly updated) working directory the client
// round-trips; Cleared asks the terminal to wipe its scrollback.
type Result struct {
	Output  string
	Cwd     string
	Cleared bool
}

type node struct {
	isDir    bool
	content  string   // files only
	children []string // dirs only — pre-sorted, read by key (no pointer recursion → no cycles possible)
}

// fs is the entire "filesystem": a fixed map keyed by CANONICAL absolute path. Every value is an inline
// public-safe constant (asserted by TestFSContentIsConstant). There is no real-FS access anywhere.
var fs = map[string]node{
	"/": {isDir: true, children: []string{"about.txt", "stack.txt", "etc", "lab"}},
	"/about.txt": {content: "gipc.dev — an operator's console for a real, self-hosted system.\n" +
		"Every metric, deploy, and agent here is live, not a mockup. Built + run by one engineer\n" +
		"on bare-metal k3s behind a Cloudflare Tunnel, infrastructure-as-code in-repo.\n"},
	"/stack.txt": {content: "web:   Next.js 15 (App Router) · vanilla CSS + @gipc/tokens · SSR-safe\n" +
		"core:  Go stdlib (no framework) — metrics, SSE, deploy webhooks, the Lab\n" +
		"ai:    Python/FastAPI · pgvector RAG · baked bge-small · claude-haiku-4-5\n" +
		"infra: k3s · Caddy · cloudflared · Terraform (Cloudflare) · GitHub Actions → ArgoCD\n"},
	"/etc":      {isDir: true, children: []string{"motd"}},
	"/etc/motd": {content: "◈ welcome to the gipc sandbox ◈\n  a safe, read-only shell — try: help · ls · cat about.txt · tree\n"},
	"/lab":      {isDir: true, children: []string{"readme.txt"}},
	"/lab/readme.txt": {content: "The Lab runs REAL, safe-by-construction demos against an isolated demo\n" +
		"namespace: chaos (kills a throwaway pod), load-test, live events, a query explorer.\n" +
		"This shell is part of that ethos: a fixed command grammar, zero arbitrary execution.\n"},
}

// commands is the fixed allowlist. Unknown input never reaches any of these — it returns "command not found".
// Populated in init() (not a var literal) to break the commands↔cmdHelp initialization cycle.
var commands map[string]func(args []string, cwd string) Result

func init() {
	commands = map[string]func(args []string, cwd string) Result{
		"help":   cmdHelp,
		"motd":   func(_ []string, cwd string) Result { return out(fs["/etc/motd"].content, cwd) },
		"banner": cmdBanner,
		"whoami": func(_ []string, cwd string) Result { return out("visitor@gipc.dev\n", cwd) },
		"uname": func(_ []string, cwd string) Result {
			return out("gipc-sandbox (safe shell) — no kernel, no exec\n", cwd)
		},
		"date": func(_ []string, cwd string) Result {
			return out(time.Now().UTC().Format("Mon 2 Jan 2006 15:04:05 MST")+"\n", cwd)
		},
		"echo":  func(args []string, cwd string) Result { return out(strings.Join(args, " ")+"\n", cwd) },
		"clear": func(_ []string, cwd string) Result { return Result{Cwd: cwd, Cleared: true} },
		"pwd":   func(_ []string, cwd string) Result { return out(cwd+"\n", cwd) },
		"ls":    cmdLs,
		"cd":    cmdCd,
		"cat":   cmdCat,
		"tree":  cmdTree,
		"history": func(_ []string, cwd string) Result {
			return out("history lives in your terminal — use ↑/↓\n", cwd)
		},
	}
}

func out(s, cwd string) Result { return Result{Output: truncate(s), Cwd: cwd} }

func truncate(s string) string {
	if len(s) <= MaxOutput {
		return s
	}
	return s[:MaxOutput] + "\n…[output truncated]\n"
}

// normalizeCwd forces an absolute, existing directory; anything unknown/relative/garbage collapses to "/".
func normalizeCwd(cwd string) string {
	if !strings.HasPrefix(cwd, "/") {
		return "/"
	}
	c := path.Clean(cwd)
	if n, ok := fs[c]; ok && n.isDir {
		return c
	}
	return "/"
}

// resolve joins a (possibly relative) target onto cwd and canonicalizes it to a map key. A ".." above root
// clamps to "/" via path.Clean. The returned string is ONLY ever used as a map key — never a real path.
func resolve(cwd, target string) string {
	if target == "" {
		return cwd
	}
	base := target
	if !strings.HasPrefix(target, "/") {
		base = cwd + "/" + target
	}
	return path.Clean(base)
}

// Execute runs one command line against cwd. Pure — no IO. Never panics on malformed input.
func Execute(cmd, cwd string) Result {
	cwd = normalizeCwd(cwd)
	fields := strings.Fields(cmd)
	if len(fields) == 0 {
		return Result{Cwd: cwd}
	}
	fn, ok := commands[fields[0]]
	if !ok {
		return out("command not found: "+fields[0]+"\n", cwd)
	}
	return fn(fields[1:], cwd)
}

func cmdHelp(_ []string, cwd string) Result {
	names := make([]string, 0, len(commands))
	for k := range commands {
		names = append(names, k)
	}
	sort.Strings(names)
	return out("commands: "+strings.Join(names, " ")+"\ntry: ls · cat about.txt · cd lab · tree · whoami\n", cwd)
}

func cmdBanner(_ []string, cwd string) Result {
	return out("   ____ _ ____   ____\n  / __ `/ / __ \\/ ___/   the arcane operator's sandbox\n"+
		" / /_/ / / /_/ / /__     safe shell · no real execution\n \\__, /_/ .___/\\___/\n"+
		"/____/ /_/\n", cwd)
}

func cmdLs(args []string, cwd string) Result {
	target := cwd
	if len(args) > 0 {
		target = resolve(cwd, args[0])
	}
	n, ok := fs[target]
	if !ok {
		return out("ls: no such file or directory: "+target+"\n", cwd)
	}
	if !n.isDir {
		return out(path.Base(target)+"\n", cwd) // ls of a file names it (like real ls)
	}
	kids := append([]string(nil), n.children...)
	sort.Strings(kids)
	return out(strings.Join(kids, "  ")+"\n", cwd)
}

func cmdCd(args []string, cwd string) Result {
	if len(args) == 0 {
		return Result{Cwd: "/"}
	}
	target := resolve(cwd, args[0])
	n, ok := fs[target]
	if !ok {
		return out("cd: no such file or directory: "+target+"\n", cwd)
	}
	if !n.isDir {
		return out("cd: not a directory: "+target+"\n", cwd)
	}
	return Result{Cwd: target}
}

func cmdCat(args []string, cwd string) Result {
	if len(args) == 0 {
		return out("cat: missing operand\n", cwd)
	}
	target := resolve(cwd, args[0])
	n, ok := fs[target]
	if !ok {
		return out("cat: no such file or directory: "+target+"\n", cwd)
	}
	if n.isDir {
		return out("cat: is a directory: "+target+"\n", cwd)
	}
	return out(n.content, cwd)
}

// cmdTree walks the fixed map BY KEY (prefix filter + sort) — never by node pointer, so a cycle is
// impossible and the output is deterministic + bounded by the (small, fixed) map.
func cmdTree(_ []string, cwd string) Result {
	keys := make([]string, 0, len(fs))
	for k := range fs {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, k := range keys {
		depth := strings.Count(k, "/")
		name := path.Base(k)
		if k == "/" {
			b.WriteString("/\n")
			continue
		}
		indent := depth - 1
		if indent < 0 { // defensive: every real fs key is absolute (≥1 slash) so this can't trigger today
			indent = 0
		}
		b.WriteString(strings.Repeat("  ", indent) + fmt.Sprintf("%s%s\n", name, dirMark(fs[k])))
	}
	return out(b.String(), cwd)
}

func dirMark(n node) string {
	if n.isDir {
		return "/"
	}
	return ""
}
