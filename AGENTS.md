# Project storage and development

- This project is local-only. The project root is the local checkout directory; it is not synced with iCloud Drive.
- Source code, manifests, documentation, tests, and small preview assets belong in the project tree and Git.
- Regenerable dependencies, caches, build output, logs, and test reports stay local and are excluded by `.gitignore`. Git ignore rules do not control iCloud.
- Bilibili development: run `npm install` in `bilibili-promo-replacer`, then `npm test` or `npm run lint`. Dependencies are regenerated in its local `node_modules` directory.
- Zhihu development: no dependency installation is needed. On macOS, run `CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node zhihu-cleaner/tests/run.mjs`. The runner uses a temporary Chrome profile under the OS temporary directory and writes its ignored report to `zhihu-cleaner/tests/latest-results.json`.
- The two extensions are independently loadable. Keep each manifest and its referenced content files together.
