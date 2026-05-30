import {describe, expect, it} from "vitest";
import {processRemoteConfigBody} from "./remote-config-server";

describe("remote config processing", () => {
    it("processes config content without persisted state", () => {
        const result = processRemoteConfigBody({
            content: "font-size = 14\nbackground = #101010",
            fileName: "config",
            clientMode: "file-system-access"
        });

        expect(result.content).toBe("font-size = 14\nbackground = #101010");
        expect(result.parsed.fontSize).toBe("14");
        expect(result.parsed.background).toBe("#101010");
        expect(result.warnings).toEqual([]);
    });

    it("rejects invalid content", () => {
        expect(() => processRemoteConfigBody({content: 123, clientMode: "file-input"})).toThrow("Expected content to be a string");
    });

    it("rejects non-object request bodies", () => {
        expect(() => processRemoteConfigBody(null)).toThrow("Expected JSON object request body");
        expect(() => processRemoteConfigBody("font-size = 13")).toThrow("Expected JSON object request body");
    });

    it("rejects configs larger than one megabyte", () => {
        expect(() => processRemoteConfigBody({
            content: "x".repeat(1024 * 1024 + 1),
            clientMode: "file-input"
        })).toThrow("Config content is too large");
    });

    it("returns warnings for empty content and ignored metadata types", () => {
        const result = processRemoteConfigBody({
            content: "   ",
            fileName: 123,
            clientMode: false
        });

        expect(result.content).toBe("   ");
        expect(result.warnings).toEqual([
            "Ignored non-string fileName.",
            "Ignored non-string clientMode.",
            "Uploaded config is empty."
        ]);
    });
});
