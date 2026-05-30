#!/usr/bin/env node
/* eslint-disable */
import {spawn} from "node:child_process";

const execPath = process.env.npm_execpath ?? "";
const isBun = execPath.includes("bun");
const packageManager = isBun ? "bun" : "npm";
const devArgs = isBun
    ? ["run", "dev", "--", "--host", "127.0.0.1"]
    : ["run", "dev", "--", "--host", "127.0.0.1"];

const children = [
    spawn(packageManager, devArgs, {stdio: "inherit"}),
    spawn("node", ["scripts/local-ghostty-server.mjs"], {stdio: "inherit"})
];

function shutdown(signal) {
    for (const child of children) child.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

for (const child of children) {
    child.on("exit", (code, signal) => {
        if (signal) return;
        if (code && code !== 0) process.exitCode = code;
        shutdown("SIGTERM");
    });
}
