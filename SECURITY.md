# Security scope

This is a local reference application using synthetic users, sessions, traffic, and customer record counts. It is not a production security service and has no real authentication system.

The default server binds to 127.0.0.1. Mutable routes validate local Host and matching Origin. Do not expose it through a public tunnel or use it to protect real accounts. The demo verification button is not MFA.

Replay performs no external inference. Live mode sends synthetic context to TypeSafe's official API. Keys belong in a local, gitignored `.env`, never in client code, recordings, screenshots, logs, or fixtures. Provider error bodies are not returned to the browser.

No scenario opens scanning sockets, tests passwords, executes exploits, or sends attack requests. Port and volumetric attacks are aggregate telemetry. No offensive automation is included.

For a potential vulnerability, avoid including credentials or non-public information in a public issue. After publishing this repository, enable GitHub private vulnerability reporting and use that channel for sensitive reports.
