import {describe, expect, it} from "vitest";
import parse from "./parse";

describe("parse", () => {
    it("parses scalar keys into camelCase config keys", () => {
        expect(parse("font-size = 14\nwindow-padding-x = 8")).toMatchObject({
            fontSize: "14",
            windowPaddingX: "8"
        });
    });

    it("normalizes six-character base colors with a leading hash", () => {
        expect(parse("background = 101010\nforeground = ffffff")).toMatchObject({
            background: "#101010",
            foreground: "#ffffff"
        });
    });

    it("preserves explicit hashed colors", () => {
        expect(parse("cursor-color = #ff00ff")).toMatchObject({
            cursorColor: "#ff00ff"
        });
    });

    it("collects repeatable keybind entries", () => {
        expect(parse("keybind = ctrl+a=select_all\nkeybind = ctrl+c=copy_to_clipboard")).toMatchObject({
            keybind: ["ctrl+a=select_all", "ctrl+c=copy_to_clipboard"]
        });
    });

    it("places valid palette entries at their numeric index", () => {
        const parsed = parse("palette = 0=#000000\npalette = 15=#ffffff");

        expect(parsed.palette[0]).toBe("#000000");
        expect(parsed.palette[15]).toBe("#ffffff");
    });

    it("ignores comments, blank lines, malformed lines, and out-of-range palette indices", () => {
        const parsed = parse([
            "# comment",
            "",
            "not a config line",
            "palette = -1=#111111",
            "palette = 256=#eeeeee",
            "font-size = 13"
        ].join("\n"));

        expect(parsed.fontSize).toBe("13");
        expect(parsed.palette.every((value) => value === "")).toBe(true);
    });
});
