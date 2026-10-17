/**
 * Run `verify-store.mjs` with DSH's peer packages resolved.
 *
 * The Host half imports `@deepseek-ai/dsh-home-paths`, which a profile provides
 * and a bare checkout does not. `peer-resolver` supplies it from the local DSH
 * installation; see that module for the lookup and the `DSH_ROOT` override.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runWithPeers } from "./peer-resolver.mjs";

const here = dirname(fileURLToPath(import.meta.url));
await runWithPeers(
	["@deepseek-ai/dsh-home-paths"],
	join(here, "verify-store.mjs"),
);
