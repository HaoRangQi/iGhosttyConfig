import {json, type RequestHandler} from "@sveltejs/kit";
import {processRemoteConfigBody} from "$lib/utils/remote-config-server";

export const POST: RequestHandler = async ({request}) => {
    let body: unknown;
    try {
        body = await request.json();
    }
    catch {
        return json({error: "Expected JSON request body"}, {status: 400});
    }

    try {
        return json(processRemoteConfigBody(body), {
            headers: {
                "Cache-Control": "no-store"
            }
        });
    }
    catch (err) {
        const status = err && typeof err === "object" && "statusCode" in err && typeof err.statusCode === "number"
            ? err.statusCode
            : 500;
        const message = err instanceof Error ? err.message : "Unexpected server error";
        return json({error: message}, {status});
    }
};
