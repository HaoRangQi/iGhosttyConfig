export interface RemoteProcessConfigRequest {
    content: string;
    fileName?: string;
    clientMode: "file-system-access" | "file-input" | "manual";
}

export interface RemoteProcessConfigResponse {
    content: string;
    parsed: Record<string, string | string[]>;
    warnings: string[];
}

export async function processRemoteConfig(request: RemoteProcessConfigRequest): Promise<RemoteProcessConfigResponse> {
    const response = await fetch("/api/remote/process-config", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(request)
    });

    if (!response.ok) {
        let message = `Remote config processing failed with ${response.status}`;
        try {
            const body = await response.json() as {error?: string};
            if (body.error) message = body.error;
        }
        catch {
            // Keep HTTP fallback message.
        }
        throw new Error(message);
    }

    return await response.json() as RemoteProcessConfigResponse;
}
