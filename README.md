# IG Checker — instruções de uso
1. Abra o arquivo __instagram_checkerv2.embedded.html__
2. Clique, segure e arraste o ***IG Checker*** para a barra de favoritos
3. Abra o instagram web, normalmente
4. Clique no icone do IG Checker na sua barra de favoritos.

# IG Checker — use instructions
1. Open the file __instagram_checkerv2.embedded.html__
2. Click, hold, and drag the ***IG Checker*** to your bookmarks bar
3. Open Instagram Web as you normally would
4. Click the IG Checker icon in your bookmarks bar.

# IG Checker — build instructions

This workspace contains:

- `code.js` — the formatted, human-readable bookmarklet script.
- `instagram_checkerv2.html` — the HTML UI with a placeholder marker for the minified script.
- `minify_and_embed.js` — Node script that minifies `code.js` and injects the result into `instagram_checkerv2.embedded.html`.

Quick start:

1. Install dependencies:

```bash
npm install
```

2. Build (minify + embed):

```bash
npm run build
```

Outputs:

- `code.min.js` — the minified script (raw code without template delimiters).
- `instagram_checkerv2.embedded.html` — copy of the HTML with `const RAW` containing the escaped minified code, ready to generate the bookmarklet URL.

Notes:

- The build script uses `terser`. If you'd prefer `esbuild` or another minifier, swap `minify_and_embed.js` accordingly.
- The script escapes backticks and `${` sequences before embedding to avoid breaking the template literal.
- The bookmarklet URL is generated as `javascript:` followed directly by the bookmarklet code.
