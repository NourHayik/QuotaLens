import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * React/Vite dashboard module.
 */
export const WEB_PHASE = 7 as const;

/**
 * Absolute directory where Vite builds the frontend distribution.
 */
export const WEB_DIST_DIR = resolve(fileURLToPath(import.meta.url), "../../../dist/web");
