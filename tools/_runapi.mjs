/**
 * Run `verify-api.mjs` with DSH's peer packages resolved.
 *
 * See `peer-resolver.mjs` for how the installation is located and why these
 * redirects exist at all.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runWithPeers } from "./peer-resolver.mjs";

const here = dirname(fileURLToPath(import.meta.url));
await runWithPeers(
	["@deepseek-ai/schemastery", "@deepseek-ai/dsh-home-paths"],
	join(here, "verify-api.mjs"),
);
