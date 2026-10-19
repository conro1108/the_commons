import { defineConfig } from "vite";
import { backoffice } from "./dev/backoffice.ts";

export default defineConfig({ plugins: [backoffice()] });
