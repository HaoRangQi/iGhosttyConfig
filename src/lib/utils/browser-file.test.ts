// @vitest-environment jsdom

import {afterEach, describe, expect, it, vi} from "vitest";
import {
    downloadTextFile,
    openWritableBrowserConfigFile,
    readBrowserUploadFile,
    supportsWritableBrowserFiles,
    writeBrowserConfigFile
} from "./browser-file";

describe("browser file utils", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        Reflect.deleteProperty(window, "showOpenFilePicker");
    });

    it("detects File System Access API support", () => {
        expect(supportsWritableBrowserFiles()).toBe(false);

        Object.defineProperty(window, "showOpenFilePicker", {
            configurable: true,
            value: vi.fn()
        });

        expect(supportsWritableBrowserFiles()).toBe(true);
    });

    it("opens a writable config file with content and handle metadata", async () => {
        const handle = {
            name: "config.ghostty",
            getFile: vi.fn(() => Promise.resolve(new File(["font-size = 14"], "config.ghostty", {type: "text/plain"}))),
            createWritable: vi.fn()
        };
        Object.defineProperty(window, "showOpenFilePicker", {
            configurable: true,
            value: vi.fn(() => Promise.resolve([handle]))
        });

        await expect(openWritableBrowserConfigFile()).resolves.toMatchObject({
            fileName: "config.ghostty",
            content: "font-size = 14",
            writable: true,
            handle,
            source: "file-system-access"
        });
    });

    it("throws when direct file write-back is unavailable", async () => {
        await expect(openWritableBrowserConfigFile()).rejects.toThrow("This browser does not support direct file write-back.");
    });

    it("reads upload fallback files as download-only config files", async () => {
        const file = new File(["background = #101010"], "config", {type: "text/plain"});

        await expect(readBrowserUploadFile(file)).resolves.toMatchObject({
            fileName: "config",
            content: "background = #101010",
            writable: false,
            handle: null,
            source: "file-input"
        });
    });

    it("writes config content with a trailing newline through file handles", async () => {
        const write = vi.fn(() => Promise.resolve());
        const close = vi.fn(() => Promise.resolve());
        const handle = {
            name: "config",
            getFile: vi.fn(),
            createWritable: vi.fn(() => Promise.resolve({write, close}))
        };

        await writeBrowserConfigFile(handle, "font-size = 16");

        expect(write).toHaveBeenCalledWith("font-size = 16\n");
        expect(close).toHaveBeenCalledOnce();
    });

    it("downloads text files and revokes object URLs", () => {
        const click = vi.fn();
        const append = vi.spyOn(document.body, "append");
        const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:config");
        const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
        const createElement = vi.spyOn(document, "createElement");

        createElement.mockImplementation((tagName: string) => {
            const element = document.createElementNS("http://www.w3.org/1999/xhtml", tagName) as HTMLAnchorElement;
            if (tagName === "a") {
                element.click = click;
            }
            return element;
        });

        downloadTextFile("foreground = #ffffff", "config");

        expect(createObjectURL).toHaveBeenCalledOnce();
        expect(append).toHaveBeenCalledOnce();
        expect(click).toHaveBeenCalledOnce();
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:config");
    });
});
