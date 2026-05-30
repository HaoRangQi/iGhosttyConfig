const LOCAL_API_BASE = "http://127.0.0.1:5174";

interface LocalConfigResponse {
    configPath: string;
    exists: boolean;
    content: string;
    candidates: string[];
}

interface ReloadResponse {
    ok: boolean;
    skipped?: boolean;
    method?: string | null;
    attempts?: Array<{command: string, code: number | null, stderr: string;}>;
}

interface SaveConfigResponse {
    configPath: string;
    backupPath: string | null;
    reload: ReloadResponse;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${LOCAL_API_BASE}${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...init?.headers
        }
    });

    if (!response.ok) {
        let message = `Local Ghostty server returned ${response.status}`;
        try {
            const body = await response.json() as {error?: string};
            if (body.error) message = body.error;
        }
        catch {
            // Keep the HTTP status message.
        }
        throw new Error(message);
    }

    return await response.json() as T;
}

export async function checkLocalGhosttyServer(): Promise<{ok: boolean, configPath: string;}> {
    return await request("/api/health");
}

export async function readLocalGhosttyConfig(): Promise<LocalConfigResponse> {
    return await request("/api/config");
}

export async function saveLocalGhosttyConfig(content: string, reload = true): Promise<SaveConfigResponse> {
    return await request("/api/config", {
        method: "POST",
        body: JSON.stringify({content, reload})
    });
}

export async function reloadLocalGhosttyConfig(): Promise<ReloadResponse> {
    return await request("/api/reload", {method: "POST"});
}
