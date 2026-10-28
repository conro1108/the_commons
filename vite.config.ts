// FAKE=1 npm run dev: the app with dev/fakenet.ts standing in for src/net.ts,
// so it runs with no network and you can look at it (see that file's knobs).
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const real = fileURLToPath(new URL("./src/net.ts", import.meta.url));
const fake = fileURLToPath(new URL("./dev/fakenet.ts", import.meta.url));

export default defineConfig({
  plugins: process.env.FAKE
    ? [{
        name: "fake-net",
        enforce: "pre",
        async resolveId(source, importer, options) {
          if (!importer || !source.endsWith("net.ts") || importer === fake) return null;
          const hit = await this.resolve(source, importer, { ...options, skipSelf: true });
          return hit?.id === real ? fake : null;
        },
      }]
    : [],
});
