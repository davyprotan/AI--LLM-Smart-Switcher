# Installation Guide

This guide covers downloading, installing, and launching LLM Smart Switcher on macOS, Windows, and Linux — including how to get past first-launch security prompts on each platform.

---

## Table of contents

- [macOS](#macos)
- [Windows](#windows)
- [Linux](#linux)
- [First launch](#first-launch)
- [Ollama setup (optional — local models)](#ollama-setup-optional--local-models)
- [Building from source](#building-from-source)
- [Uninstalling](#uninstalling)

---

## macOS

### System requirements

- macOS 12 Monterey or later
- Apple Silicon (M1/M2/M3/M4) or Intel — both are covered by the universal binary

### Download

1. Go to [Releases](https://github.com/davyprotan/AI--LLM-Smart-Switcher/releases).
2. Under **Assets**, download `LLM Smart Switcher_x.x.x_universal.dmg`.

### Install

1. Open the `.dmg` file.
2. Drag **LLM Smart Switcher** into your **Applications** folder.
3. Eject the disk image.

### First-launch security prompt

Because the app is not yet notarized by Apple, macOS Gatekeeper will block it on first launch.

**To open it anyway:**

Option A — right-click method (recommended):
1. In Finder, navigate to **Applications**.
2. **Right-click** (or Control-click) the app icon.
3. Select **Open**.
4. In the dialog that appears, click **Open** again.

You only need to do this once. After that, the app opens normally.

Option B — System Settings:
1. Try to open the app normally — it will be blocked.
2. Go to **System Settings → Privacy & Security**.
3. Scroll down to the **Security** section — you will see a message about the blocked app.
4. Click **Open Anyway**.

> **Why does this happen?** macOS requires apps distributed outside the App Store to be signed and notarized by Apple. Code signing requires an Apple Developer account ($99/year). We plan to add notarization in a future release. The app itself makes no outbound connections except to locally-running Ollama (`localhost:11434`) and the AI provider APIs you configure.

### Config file access

The app reads and writes config files in your home directory (e.g. `~/.claude/`, `~/Library/Application Support/`). macOS may show a permission prompt the first time the app accesses a new directory — click **Allow** to let it proceed.

---

## Windows

### System requirements

- Windows 10 (version 1903) or later
- Windows 11 recommended
- [WebView2 runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) — required by Tauri. Most Windows 11 systems have it already. Windows 10 may need it installed separately (the installer will prompt you if needed).

### Download

1. Go to [Releases](https://github.com/davyprotan/AI--LLM-Smart-Switcher/releases).
2. Under **Assets**, download `LLM Smart Switcher_x.x.x_x64-setup.exe`.

### Install

1. Run the installer (`_x64-setup.exe`).
2. Follow the on-screen prompts — the app installs per-machine by default.
3. A Start Menu shortcut is created automatically.

### SmartScreen prompt

Windows SmartScreen may show a blue warning dialog ("Windows protected your PC") the first time you run the installer, because the app is not yet code-signed with an Authenticode certificate.

**To proceed:**

1. Click **More info** in the SmartScreen dialog.
2. Click **Run anyway**.

> **Why does this happen?** Windows SmartScreen flags installers that lack an Authenticode certificate or that don't yet have download reputation. Code signing requires a certificate from a commercial CA ($200–500/year). We plan to add signing in a future release.

### WebView2 runtime

If WebView2 is not present on your system, the installer will download and install it automatically. This requires an internet connection during installation.

You can also pre-install it from Microsoft: https://developer.microsoft.com/en-us/microsoft-edge/webview2/

---

## Linux

Three package formats are available. Choose the one that matches your distribution.

### System requirements

- 64-bit x86 (amd64)
- WebKitGTK 4.1 (installed automatically by deb/rpm; required for AppImage)
- glibc 2.31 or later (Ubuntu 20.04+ / Fedora 34+)

---

### Debian / Ubuntu (`.deb`)

```bash
# Download (replace x.x.x with the actual version)
wget https://github.com/davyprotan/AI--LLM-Smart-Switcher/releases/download/vx.x.x/llm-smart-switcher_x.x.x_amd64.deb

# Install
sudo dpkg -i llm-smart-switcher_x.x.x_amd64.deb

# Fix any missing dependencies
sudo apt-get install -f
```

The app appears in your application launcher after install. You can also launch it from the terminal:
```bash
llm-smart-switcher
```

---

### Fedora / RHEL / openSUSE (`.rpm`)

```bash
# Fedora / RHEL
sudo dnf install llm-smart-switcher_x.x.x_x86_64.rpm

# openSUSE
sudo zypper install llm-smart-switcher_x.x.x_x86_64.rpm
```

---

### AppImage (any distro)

The AppImage is a self-contained executable that runs on most x86-64 Linux distributions without installation.

```bash
# Download
wget https://github.com/davyprotan/AI--LLM-Smart-Switcher/releases/download/vx.x.x/llm-smart-switcher_x.x.x_amd64.AppImage

# Make executable
chmod +x llm-smart-switcher_x.x.x_amd64.AppImage

# Run
./llm-smart-switcher_x.x.x_amd64.AppImage
```

> **FUSE requirement:** AppImages require FUSE to run. Most desktop distros have it. If you see an error about FUSE, install it:
> ```bash
> # Ubuntu / Debian
> sudo apt-get install libfuse2
>
> # Fedora
> sudo dnf install fuse
> ```

### Required system libraries (if installing manually)

If you get errors about missing libraries after a manual install, install these:

```bash
# Ubuntu / Debian
sudo apt-get install libwebkit2gtk-4.1-0 libappindicator3-1

# Fedora
sudo dnf install webkit2gtk4.1
```

---

## First launch

When the app opens for the first time:

1. **Hardware screen loads** — the app scans your CPU, RAM, disk, and GPU. This takes a few seconds.

2. **Baseline snapshot prompt** — a green banner appears at the top:
   > "No config baseline captured yet. Capture a snapshot of your current config state before making any changes."

   Click **Capture baseline** to save a snapshot of all your current tool configs. This gives you a safe point to compare against and restore from. You can dismiss the banner and do this later from the **Snapshots** screen.

3. **Switcher screen** — go here to preview and apply provider/model changes to each discovered tool.

---

## Ollama setup (optional — local models)

[Ollama](https://ollama.com) lets you run models like Llama, Mistral, and Qwen locally. The app auto-discovers any models you have installed.

### Install Ollama

**macOS / Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows:** Download the installer from https://ollama.com/download

### Pull a model

```bash
ollama pull llama3.2:3b       # small, fast, ~2GB download
ollama pull mistral:7b         # balanced, ~4GB download
ollama pull qwen2.5-coder:7b  # optimised for code, ~4GB download
```

### Verify it's running

```bash
curl http://localhost:11434/api/tags
```

You should see a JSON list of your installed models. The app's **Models** screen will show them automatically on next load.

---

## Building from source

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Rust | stable | https://rustup.rs |
| Node.js | 22+ | https://nodejs.org |
| npm | 10+ | Included with Node.js |

**macOS:** Also requires Xcode Command Line Tools:
```bash
xcode-select --install
```

**Ubuntu / Debian:** Also requires system libraries:
```bash
sudo apt-get install \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  build-essential
```

**Windows:** Also requires:
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (select "Desktop development with C++")
- [WebView2 runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

### Clone and run

```bash
git clone https://github.com/davyprotan/AI--LLM-Smart-Switcher.git
cd AI--LLM-Smart-Switcher

# Install frontend dependencies
npm install

# Start in development mode (hot-reload)
npm run tauri dev
```

### Build a release bundle

```bash
npm run tauri build
```

Output is placed in `src-tauri/target/release/bundle/`. On macOS this produces a `.dmg`, on Windows a `.msi` and `.exe` NSIS installer, on Linux a `.deb`, `.rpm`, and `.AppImage`.

> **macOS note:** A full `.dmg` requires Xcode (not just Command Line Tools). Without the full Xcode install, `tauri build` still produces a runnable `.app` binary at `src-tauri/target/release/bundle/macos/`.

### Run tests

```bash
# Rust unit tests (write pipeline, parsers, snapshot logic)
cd src-tauri
cargo test

# Frontend type check
cd ..
npm run build
```

---

## Uninstalling

**macOS:** Drag the app from `/Applications` to the Trash. Config backups and snapshots created by the app are stored in the same directories as your tool configs — they can be deleted manually if desired.

**Windows:** Go to **Settings → Apps → Installed apps**, find **LLM Smart Switcher**, and click **Uninstall**.

**Linux (deb):**
```bash
sudo dpkg -r llm-smart-switcher
```

**Linux (rpm):**
```bash
sudo dnf remove llm-smart-switcher
# or
sudo rpm -e llm-smart-switcher
```

**Linux (AppImage):** Delete the `.AppImage` file. No system files are installed.

---

## Troubleshooting

**The app doesn't detect my Claude Code / VS Code / Cursor config.**

The app searches standard config paths for each tool. If you've installed a tool to a non-standard location, the config may not be found automatically. Check the path shown in the Switcher card — if it's wrong, the Repair hint in the card will explain what the app expected to find and where.

**The Switcher shows "blocked" instead of "ready to apply."**

This usually means the config file is missing, unreadable, or has a parse error. The plan result panel will show a block reason. Common fixes:
- Open the tool at least once so it creates its config file.
- Check file permissions (`ls -la ~/.claude/settings.json`).
- Validate the JSON/YAML syntax manually.

**Ollama models don't appear.**

Make sure Ollama is running (`ollama serve` or the system service). Check:
```bash
curl http://localhost:11434/api/tags
```
If that returns an error, Ollama isn't running. Start it and reload the Models screen.

**On Linux, the app crashes on launch with a WebKit error.**

Install the required GTK/WebKit libraries:
```bash
sudo apt-get install libwebkit2gtk-4.1-0   # Ubuntu / Debian
sudo dnf install webkit2gtk4.1              # Fedora
```

---

For more detail on how integrations work and what config keys the app reads and writes, see [docs/integrations.md](integrations.md).
