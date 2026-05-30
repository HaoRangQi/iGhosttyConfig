/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Readable} from "node:stream";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const ORIGINAL_ENV = {...process.env};

let tempRoot;
async function loadServerModule(env = {}) {
    process.env = {
        ...ORIGINAL_ENV,
        ...env
    };
    vi.resetModules();
    return await import("./local-ghostty-server.mjs");
}

beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "ghostty-config-local-test-"));
});

afterEach(() => {
    process.env = {...ORIGINAL_ENV};
    if (tempRoot) rmSync(tempRoot, {recursive: true, force: true});
});

describe("local Ghostty companion server helpers", () => {
    it("prefers GHOSTTY_CONFIG_PATH and expands home paths", async () => {
        const mod = await loadServerModule({
            HOME: tempRoot,
            GHOSTTY_CONFIG_PATH: "~/ghostty/config"
        });

        expect(mod.resolveHome("~/ghostty/config")).toBe(join(tempRoot, "ghostty/config"));
        expect(mod.getTargetPath()).toBe(join(tempRoot, "ghostty/config"));
    });

    it("selects the first existing XDG config candidate", async () => {
        const xdgConfigHome = join(tempRoot, "xdg");
        const configPath = join(xdgConfigHome, "ghostty", "config");
        mkdirSync(join(xdgConfigHome, "ghostty"), {recursive: true});
        writeFileSync(configPath, "font-size = 15", {encoding: "utf8", flag: "wx"});

        const mod = await loadServerModule({
            HOME: tempRoot,
            XDG_CONFIG_HOME: xdgConfigHome
        });

        const localConfig = mod.readLocalConfig();

        expect(localConfig.configPath).toBe(configPath);
        expect(localConfig.exists).toBe(true);
        expect(localConfig.content).toBe("font-size = 15");
    });

    it("writes content with a trailing newline and backs up existing files", async () => {
        const configPath = join(tempRoot, "config.ghostty");
        writeFileSync(configPath, "font-size = 13\n", "utf8");

        const mod = await loadServerModule({
            HOME: tempRoot,
            GHOSTTY_CONFIG_PATH: configPath
        });

        const result = mod.writeLocalConfig("font-size = 18");

        expect(result.configPath).toBe(configPath);
        expect(result.backupPath).toContain(`${configPath}.backup-`);
        expect(readFileSync(configPath, "utf8")).toBe("font-size = 18\n");
        expect(readFileSync(result.backupPath, "utf8")).toBe("font-size = 13\n");
    });

    it("rejects non-string writes", async () => {
        const mod = await loadServerModule({HOME: tempRoot});

        expect(() => mod.writeLocalConfig(42)).toThrow("Expected JSON body with a string content field");
    });

    it("limits JSON request body size before parsing", async () => {
        const mod = await loadServerModule({HOME: tempRoot});
        const oversized = Readable.from([Buffer.alloc(mod.MAX_BODY_BYTES + 1)]);

        await expect(mod.readJsonBody(oversized)).rejects.toMatchObject({
            message: "Request body is too large",
            statusCode: 413
        });
    });

    it("only adds CORS headers for allowed origins", async () => {
        const mod = await loadServerModule({HOME: tempRoot});
        const allowed = createMockResponse();
        const denied = createMockResponse();

        mod.send(allowed, 200, {ok: true}, "http://localhost:5173");
        mod.send(denied, 200, {ok: true}, "https://example.com");

        expect(allowed.headers["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
        expect(denied.headers["Access-Control-Allow-Origin"]).toBeUndefined();
        expect(allowed.body).toBe("{\"ok\":true}");
    });
});

function createMockResponse() {
    return {
        statusCode: 0,
        headers: {},
        body: "",
        writeHead(statusCode, headers) {
            this.statusCode = statusCode;
            this.headers = headers;
        },
        end(body) {
            this.body = body;
        }
    };
}
