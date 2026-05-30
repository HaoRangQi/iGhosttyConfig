#!/usr/bin/env node
/* eslint-disable */
import {spawn} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from "node:fs";
import {homedir, platform} from "node:os";
import {dirname, join} from "node:path";

export const DEFAULT_PORT = Number.parseInt(process.env.GHOSTTY_CONFIG_PORT ?? "5174", 10);
export const HOST = process.env.GHOSTTY_CONFIG_HOST ?? "127.0.0.1";
export const MAX_BODY_BYTES = 1024 * 1024;
export const ALLOWED_ORIGINS = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...(process.env.GHOSTTY_CONFIG_ALLOWED_ORIGINS ?? "").split(",").map(origin => origin.trim()).filter(Boolean)
]);

export function getHomeDir() {
    return process.env.HOME || homedir();
}

export function resolveHome(path) {
    return path.replace(/^~(?=$|\/)/, getHomeDir());
}

export function candidateConfigPaths() {
    const candidates = [];
    if (process.env.GHOSTTY_CONFIG_PATH) candidates.push(resolveHome(process.env.GHOSTTY_CONFIG_PATH));

    const xdgConfigHome = process.env.XDG_CONFIG_HOME || join(getHomeDir(), ".config");
    candidates.push(join(xdgConfigHome, "ghostty", "config.ghostty"));
    candidates.push(join(xdgConfigHome, "ghostty", "config"));

    if (platform() === "darwin") {
        const appSupport = join(getHomeDir(), "Library", "Application Support", "com.mitchellh.ghostty");
        candidates.push(join(appSupport, "config.ghostty"));
        candidates.push(join(appSupport, "config"));
    }

    return [...new Set(candidates)];
}

export function getTargetPath() {
    if (process.env.GHOSTTY_CONFIG_PATH) return resolveHome(process.env.GHOSTTY_CONFIG_PATH);

    const candidates = candidateConfigPaths();
    return candidates.find(path => existsSync(path)) ?? candidates[0];
}

export function readLocalConfig() {
    const configPath = getTargetPath();
    const exists = existsSync(configPath);
    return {
        configPath,
        exists,
        content: exists ? readFileSync(configPath, "utf8") : "",
        candidates: candidateConfigPaths()
    };
}

export function backupPathFor(configPath) {
    const stamp = new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
    return `${configPath}.backup-${stamp}`;
}

export async function readJsonBody(req) {
    const chunks = [];
    let size = 0;

    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large"), {statusCode: 413});
        chunks.push(chunk);
    }

    if (!chunks.length) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function writeLocalConfig(content) {
    if (typeof content !== "string") {
        throw Object.assign(new Error("Expected JSON body with a string content field"), {statusCode: 400});
    }

    const configPath = getTargetPath();
    mkdirSync(dirname(configPath), {recursive: true});

    const backupPath = existsSync(configPath) && statSync(configPath).isFile()
        ? backupPathFor(configPath)
        : null;

    if (backupPath) writeFileSync(backupPath, readFileSync(configPath));
    writeFileSync(configPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");

    return {configPath, backupPath};
}

export function commandExists(command) {
    return new Promise(resolve => {
        const child = spawn("command", ["-v", command], {shell: true, stdio: "ignore"});
        child.on("close", code => resolve(code === 0));
        child.on("error", () => resolve(false));
    });
}

export function run(command, args) {
    return new Promise(resolve => {
        const child = spawn(command, args, {stdio: ["ignore", "pipe", "pipe"]});
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", chunk => stdout += chunk);
        child.stderr.on("data", chunk => stderr += chunk);
        child.on("close", code => resolve({ok: code === 0, code, stdout, stderr, command: [command, ...args].join(" ")}));
        child.on("error", error => resolve({ok: false, code: null, stdout, stderr: error.message, command: [command, ...args].join(" ")}));
    });
}

export async function reloadGhostty() {
    const attempts = [];

    if (platform() === "linux" && await commandExists("systemctl")) {
        attempts.push(await run("systemctl", ["reload", "--user", "app-com.mitchellh.ghostty.service"]));
    }

    if (platform() === "linux" && await commandExists("pkill")) {
        attempts.push(await run("pkill", ["-USR2", "-x", "ghostty"]));
        if (!attempts.at(-1)?.ok) attempts.push(await run("pkill", ["-USR2", "-x", "Ghostty"]));
    }

    if (platform() === "darwin" && await commandExists("osascript")) {
        attempts.push(await run("osascript", [
            "-e", "tell application \"Ghostty\" to activate",
            "-e", "tell application \"System Events\" to keystroke \",\" using {command down, shift down}"
        ]));
    }

    const successful = attempts.find(attempt => attempt.ok);
    return {
        ok: Boolean(successful),
        method: successful?.command ?? null,
        attempts: attempts.map(({command, code, stderr}) => ({command, code, stderr: stderr.trim()}))
    };
}

export function send(res, statusCode, body, origin) {
    const headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Vary": "Origin"
    };

    if (origin && ALLOWED_ORIGINS.has(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
        headers["Access-Control-Allow-Headers"] = "Content-Type";
        headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
    }

    res.writeHead(statusCode, headers);
    res.end(JSON.stringify(body));
}

export function sendError(res, error, origin) {
    const statusCode = error.statusCode || 500;
    send(res, statusCode, {error: error.message || "Unexpected server error"}, origin);
}

export async function handler(req, res) {
    const origin = req.headers.origin;
    const url = new URL(req.url ?? "/", `http://${HOST}:${DEFAULT_PORT}`);

    if (req.method === "OPTIONS") {
        send(res, 204, {}, origin);
        return;
    }

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
        send(res, 403, {error: "Origin is not allowed by the local Ghostty config server"}, origin);
        return;
    }

    try {
        if (req.method === "GET" && url.pathname === "/api/health") {
            send(res, 200, {ok: true, configPath: getTargetPath()}, origin);
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/config") {
            send(res, 200, readLocalConfig(), origin);
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/config") {
            const body = await readJsonBody(req);
            const writeResult = writeLocalConfig(body.content);
            const reload = body.reload === false ? {ok: false, skipped: true} : await reloadGhostty();
            send(res, 200, {...writeResult, reload}, origin);
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/reload") {
            send(res, 200, await reloadGhostty(), origin);
            return;
        }

        send(res, 404, {error: "Not found"}, origin);
    }
    catch (error) {
        sendError(res, error, origin);
    }
}

export async function startServer(port = DEFAULT_PORT, host = HOST) {
    const {createServer} = await import("node:http");
    const server = createServer((req, res) => void handler(req, res));

    server.listen(port, host, () => {
        const {configPath, exists} = readLocalConfig();
        console.log(`Ghostty local config server: http://${host}:${port}`);
        console.log(`Target config: ${configPath}${exists ? "" : " (will be created on save)"}`);
    });

    return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    await startServer();
}
