# LLM Smart Switcher

Preview, apply, and roll back LLM provider and model changes across your coding tools — with automatic backups and config diffs before every write.

**Supported tools:** Claude Code · VS Code · Cursor · Windsurf · Continue.dev · Terminal  
**Supported providers:** Anthropic · OpenAI · Google · Ollama · llama.cpp  
**Platforms:** macOS (Apple Silicon + Intel) · Windows · Linux

---

## Download

Go to the [**Releases**](https://github.com/davyprotan/AI--LLM-Smart-Switcher/releases) page and download the file for your OS:

| OS | File to download |
|---|---|
| macOS (Apple Silicon + Intel) | `LLM Smart Switcher_x.x.x_universal.dmg` |
| Windows | `LLM Smart Switcher_x.x.x_x64-setup.exe` |
| Linux (Debian / Ubuntu) | `llm-smart-switcher_x.x.x_amd64.deb` |
| Linux (Fedora / RHEL) | `llm-smart-switcher_x.x.x_x86_64.rpm` |
| Linux (universal AppImage) | `llm-smart-switcher_x.x.x_amd64.AppImage` |

> For full installation steps and first-launch security prompts, see [**docs/installation.md**](docs/installation.md).

---

## What it does

| Screen | Purpose |
|---|---|
| **Dashboard** | At-a-glance health: hardware, active providers, baseline status |
| **Hardware** | CPU, RAM, disk, and GPU detection with live VRAM telemetry |
| **Models** | Browse Ollama-installed models and hosted API models with VRAM estimates |
| **Switcher** | Preview and apply provider/model changes per tool with diff preview |
| **Snapshots** | Capture and compare config baselines; restore any previous state |
| **Settings** | App preferences and telemetry interval |
| **Benchmark** | (Roadmap) Run latency and throughput benchmarks |

### How switching works

1. **Preview** — the app shows you exactly which config keys will change and their before/after values before anything is written.
2. **Backup** — a timestamped backup of the original file is written automatically.
3. **Apply** — the change is written atomically; the file is verified after writing.
4. **Rollback** — if verification fails, the backup is restored automatically. Manual rollback is always available from the Snapshots screen.

---

## Quick start (3 steps)

1. Download and install the app for your OS (see [installation guide](docs/installation.md)).
2. Open the app — it will prompt you to **capture a baseline snapshot** of your current configs.
3. Go to **Switcher**, pick a tool, choose a provider and model, hit **Preview plan**, then **Apply**.

---

## Supported integrations

| Tool | Config format | Config location |
|---|---|---|
| Claude Code | JSON | `~/.claude/settings.json` |
| VS Code | JSON | Per-platform `settings.json` in `User/` |
| Cursor | JSON | Per-platform `settings.json` in `User/` |
| Windsurf | JSON | Per-platform `settings.json` in `User/` |
| Continue.dev | JSON | `~/.continue/config.json` |
| Terminal | YAML/JSON | Varies by shell configuration |

See [docs/integrations.md](docs/integrations.md) for per-platform path details.

---

## Local model support (Ollama)

The app auto-discovers models installed via [Ollama](https://ollama.com) at `localhost:11434`. If Ollama is not running, the Models screen falls back to showing the hosted API catalog only.

To install a local model:
```
ollama pull llama3.2:3b
```
Then reload the Models screen — it appears automatically.

---

## Safety and backups

- Every config write is preceded by an automatic backup (stored alongside the original file with a timestamp suffix).
- The app verifies the written file matches the intended change before reporting success.
- If verification fails, the backup is restored automatically.
- You can manually restore any snapshot from the Snapshots screen at any time.

See [docs/safety-and-rollback.md](docs/safety-and-rollback.md) for the full policy.

---

## Documentation

- [Installation guide](docs/installation.md) — download, install, and first-launch steps per OS
- [Integrations](docs/integrations.md) — supported tools and config path details
- [Safety and rollback](docs/safety-and-rollback.md) — backup, verification, and restore policy
- [Architecture](docs/architecture.md) — how the Tauri + React + Rust stack is organized
- [Roadmap](docs/roadmap.md) — planned features and known limitations

---

## Building from source

See [docs/installation.md#building-from-source](docs/installation.md#building-from-source) for full developer setup instructions.

Quick summary:
```bash
# Prerequisites: Rust stable, Node.js 22+, platform build tools
git clone https://github.com/davyprotan/AI--LLM-Smart-Switcher.git
cd AI--LLM-Smart-Switcher
npm install
npm run tauri dev     # development
npm run tauri build   # production bundle
```

---

## License

MIT — see [LICENSE](LICENSE) for details.
