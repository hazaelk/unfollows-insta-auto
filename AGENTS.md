# Repository Agent Instructions

## Project overview

This workspace builds an Instagram account checker as a browser bookmarklet. The readable bookmarklet implementation is in `code.js`; `instagram_checkerv2.html` is the source UI that wraps the generated bookmarklet. The README documents the user-facing build flow: [README.md](README.md).

## Source of truth

- Edit `code.js` for bookmarklet behavior, Instagram API calls, UI rendering, and DOM logic.
- Edit `instagram_checkerv2.html` for the bookmarklet generator UI and its `RAW` display/URL behavior.
- Keep the marker `__INJECT_MINIFIED_SCRIPT_HERE__` intact in `instagram_checkerv2.html` unless the build contract in `minify_and_embed.js` is intentionally changed.
- Treat `code.min.js` and `instagram_checkerv2.embedded.html` as generated outputs, not primary edit targets.
- Do not assume similarly named legacy files, copies, or nested projects are canonical without checking their role first.

## Build and validation

- Install dependencies with `npm install` when needed.
- Run `npm run build` to minify `code.js` and regenerate `code.min.js` and `instagram_checkerv2.embedded.html`.
- Review the generated diff as bookmarklet output changes are not automatically human-readable.
- There is no test suite configured in `package.json`; use `npm run build` as the required executable validation.
- The builder uses Terser and expects Node.js CommonJS/ES2018-compatible browser output.
- If `node` or `npm` is not recognized in PowerShell, restore the Node.js installation directory (commonly `C:\Program Files\nodejs`) to `PATH` or restart VS Code after installation.

## Browser and safety constraints

- Bookmarklet code runs on Instagram pages and relies on authenticated browser cookies and the Instagram GraphQL/REST endpoints.
- Preserve `credentials: "include"`, CSRF-token handling, and existing user confirmation/rate-limit protections when changing API actions.
- Do not add secrets, credentials, personal data, or hidden tracking to source or generated files.
- Keep destructive actions (unfollow/remove follower) explicit and user-confirmed; handle API failures without retrying indefinitely.
- Exercise changes in a logged-in browser session against a disposable account when possible. Do not add automated Instagram requests to the repository tests.

## Code conventions

- Follow the existing dependency-free JavaScript style in `code.js`; keep DOM construction and Instagram API calls separated from orchestration when practical.
- Preserve the ASCII-safe minification contract by checking that Terser output remains embeddable inside the HTML template literal.
- Escaping template-backtick and `${...}` sequences belongs in `minify_and_embed.js`; preserve both escaping and replacement order when modifying it.
- Keep UI changes constrained to the existing fixed bookmarklet modal and avoid adding build-time dependencies without updating the README and package scripts.
