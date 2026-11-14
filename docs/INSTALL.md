# Install and first launch

Download the personal app from [KeepMind releases](https://github.com/criptogus/keepmind/releases). Choose the macOS `.dmg` (open it and drag KeepMind to Applications), Windows `.exe` (run the installer), or Linux `.AppImage` (make it executable and run it).

Builds are not code-signed yet. On macOS 15 or later, open the app once, then go to System Settings > Privacy & Security and choose Open Anyway. On macOS 14 or earlier, you can also right-click the app and choose Open. On Windows, choose More info, then Run anyway.

## KeepMind Corp

KeepMind Corp is a separate installer with its own GitHub release; the personal installer does not install Corp. The current stable Corp release is [`corp-v0.2.6`](https://github.com/criptogus/keepmind/releases/tag/corp-v0.2.6) in this repository. On `main`, `electron-builder.corp.yml` publishes later Corp builds to [criptogus/keepmind-corp](https://github.com/criptogus/keepmind-corp/releases).

Corp uses Windows `.exe`, macOS `.dmg` and Linux `.AppImage` installers. The same first-launch instructions above apply. See [Corp setup](../corp/README.md) for organization configuration.
