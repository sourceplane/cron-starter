import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Rules eslint-config-next 16 brings that the template was not written
      // against, turned off by name rather than rewriting upstream code:
      // - `getLayout(Component)` in pages/_app.tsx builds the layout during
      //   render (the @vercel/examples-ui pattern).
      "react-hooks/static-components": "off",
      // worker.ts imports the generated `.open-next/worker.js` the way the
      // OpenNext custom-worker howto does: `@ts-ignore` with a reason, because
      // the file does not exist before the build and an `@ts-expect-error`
      // would then be "unused" after it.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": "allow-with-description" },
      ],
    },
  },
  {
    // @vercel/examples-ui exports its Tailwind preset under a `require`-only
    // condition, so the template's CommonJS tailwind.config.js stays as is.
    files: ["tailwind.config.js", "postcss.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // .wrangler holds the bundles `wrangler dev` writes; never source.
  globalIgnores([".next/**", ".open-next/**", ".wrangler/**", "next-env.d.ts", "cloudflare-env.d.ts"]),
]);
