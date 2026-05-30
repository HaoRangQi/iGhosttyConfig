import parse from "$lib/utils/parse";

const MAX_CONFIG_BYTES = 1024 * 1024;

export interface RemoteProcessConfigResult {
    content: string;
    parsed: Record<string, string | string[]>;
    warnings: string[];
}

export function processRemoteConfigBody(body: unknown): RemoteProcessConfigResult {
    if (!body || typeof body !== "object") {
        throw Object.assign(new Error("Expected JSON object request body"), {statusCode: 400});
    }

    const {content, fileName, clientMode} = body as {
        content?: unknown;
        fileName?: unknown;
        clientMode?: unknown;
    };

    if (typeof content !== "string") {
        throw Object.assign(new Error("Expected content to be a string"), {statusCode: 400});
    }

    const byteLength = new TextEncoder().encode(content).byteLength;
    if (byteLength > MAX_CONFIG_BYTES) {
        throw Object.assign(new Error("Config content is too large"), {statusCode: 413});
    }

    const warnings: string[] = [];
    if (fileName !== undefined && typeof fileName !== "string") warnings.push("Ignored non-string fileName.");
    if (clientMode !== undefined && typeof clientMode !== "string") warnings.push("Ignored non-string clientMode.");
    if (!content.trim()) warnings.push("Uploaded config is empty.");

    return {
        content,
        parsed: parse(content),
        warnings
    };
}
