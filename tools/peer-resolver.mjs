/**
 * Resolve DSH's peer packages for the `_run*.mjs` entry points.
 *
 * The verification scripts import this project's Host half, which declares
 * `@deepseek-ai/schemastery` and `@deepseek-ai/dsh-home-paths` as peers: in a
 * profile those come from the installation, and outside one nothing provides
 * them. This module registers a loader hook that redirects exactly those bare
 * specifiers at the installation's copies — no more, so an undeclared import
 * still fails the way it would in a profile.
 *
 * It used to hardcode one machine's npm global directory, which made the
 * verification suite unrunnable anywhere else. The installation is now located
 * the same way the Python scripts locate it: `DSH_ROOT` if set, otherwise the
 * usual install locations. Node cannot import the Python helper, so the search
 * is repeated here; keep the two in step.
 *
 * @module tools/peer-resolver
 */
import { register } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** The `@deepseek-ai` directory of a DSH installation, or undefined. */
function findPackages() {
	const candidates = [];
	const override = (process.env.DSH_ROOT ?? "").trim();
	if (override !== "") {
		candidates.push(override, join(override, "dsh"));
	}
	const home = homedir();
	for (const prefix of [
		join(home, "AppData", "Roaming", "npm"),
		"/usr/local/lib",
		"/usr/lib",
	]) {
		candidates.push(join(prefix, "@deepseek-ai", "dsh"));
		candidates.push(join(prefix, "node_modules", "@deepseek-ai", "dsh"));
	}
	// A `dsh` executable on PATH can say where it lives.
	for (const entry of (process.env.PATH ?? "").split(delimiter)) {
		if (entry === "") continue;
		candidates.push(join(entry, "node_modules", "@deepseek-ai", "dsh"));
		candidates.push(join(entry, ".."));
	}
	for (const candidate of candidates) {
		const packages = join(candidate, "node_modules", "@deepseek-ai");
		if (existsSync(packages)) return packages;
	}
	return undefined;
}

/** The entry file a package's manifest points at, preferring ESM. */
function entryOf(directory) {
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
	} catch {
		return undefined;
	}
	const exported = manifest.exports?.["."];
	const fromExports = typeof exported === "string"
		? exported
		: exported?.import ?? exported?.default;
	const entry = fromExports ?? manifest.module ?? manifest.main;
	return typeof entry === "string" ? resolve(directory, entry) : undefined;
}

/**
 * Redirect the named peers at the installation and import the given script.
 * @param names - the bare specifiers to redirect.
 * @param script - absolute path of the verification script to run.
 */
export async function runWithPeers(names, script) {
	const packages = findPackages();
	if (packages === undefined) {
		throw new Error(
			"could not find a DSH installation; set DSH_ROOT to the directory holding the dsh package",
		);
	}
	const map = {};
	for (const name of names) {
		const entry = entryOf(join(packages, name.split("/").pop()));
		if (entry === undefined) {
			throw new Error(`could not resolve peer ${name} under ${packages}`);
		}
		map[name] = pathToFileURL(entry).href;
	}
	register(
		"data:text/javascript," +
			encodeURIComponent(
				`const M=${JSON.stringify(map)};` +
					`export async function resolve(s,c,n){const u=M[s];if(u)return{url:u,shortCircuit:true};return n(s,c);}`,
			),
		import.meta.url,
	);
	await import(pathToFileURL(script).href);
}

/** The directory this file lives in, so callers do not repeat path arithmetic. */
export const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
