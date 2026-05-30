import {expect, test} from "@playwright/test";

test("remote mode exposes team workflow and hides local companion controls", async ({page}) => {
    await page.goto("/app/import-export");

    await expect(page.getByText("Start a remote team editing session")).toBeVisible();
    await expect(page.getByRole("button", {name: "Open Local Config"})).toHaveCount(2);
    await expect(page.getByRole("button", {name: "Open Local Config"}).first()).toBeVisible();
    await expect(page.getByRole("button", {name: "Upload File"})).toHaveCount(2);
    await expect(page.getByRole("button", {name: "Upload File"}).first()).toBeVisible();
    await expect(page.getByRole("button", {name: "New Config"})).toBeVisible();
    await expect(page.getByText("Remote Team", {exact: true})).toBeVisible();

    await expect(page.getByText("Local Ghostty", {exact: true})).toHaveCount(0);
    await expect(page.getByRole("button", {name: "Reload"})).toHaveCount(0);
});

test("remote file upload processes config and enables review save fallback", async ({page}) => {
    await page.goto("/app/import-export");

    await page.setInputFiles("#remote-config-input", {
        name: "config",
        mimeType: "text/plain",
        buffer: Buffer.from("font-size = 18\nbackground = 101010\nkeybind = ctrl+a=select_all\n")
    });

    await expect(page.getByText("Remote config processed: config")).toBeVisible();
    await expect(page.getByText("config · download-only fallback")).toBeVisible();
    await expect(page.locator(".preview")).toContainText("font-size = 18");
    await expect(page.locator(".preview")).toContainText("background = #101010");
    await expect(page.locator(".preview")).toContainText("keybind = ctrl+a=select_all");

    const reviewButton = page.getByRole("button", {name: "Review & Save"});
    await expect(reviewButton).toBeEnabled();
    await reviewButton.click();

    await expect(page.getByRole("dialog", {name: "Overwrite local Ghostty config?"})).toBeVisible();
    await expect(page.getByText("Target: config")).toBeVisible();
    await expect(page.getByRole("dialog", {name: "Overwrite local Ghostty config?"})).toContainText("font-size");
    await expect(page.getByRole("dialog", {name: "Overwrite local Ghostty config?"})).toContainText("background");
    await expect(page.getByRole("dialog", {name: "Overwrite local Ghostty config?"})).toContainText("keybind");
    await expect(page.getByRole("button", {name: "Download File"})).toBeVisible();
});

test("remote API rejects malformed and oversized requests", async ({request}) => {
    const malformed = await request.post("/api/remote/process-config", {
        data: {content: 42, clientMode: "file-input"}
    });
    expect(malformed.status()).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
        error: "Expected content to be a string"
    });

    const oversized = await request.post("/api/remote/process-config", {
        data: {content: "x".repeat(1024 * 1024 + 1), clientMode: "file-input"}
    });
    expect(oversized.status()).toBe(413);
    await expect(oversized.json()).resolves.toMatchObject({
        error: "Config content is too large"
    });
});

test("remote API handles boundary-sized and concurrent config processing", async ({request}) => {
    const exactLimitContent = "x".repeat(1024 * 1024);
    const exactLimit = await request.post("/api/remote/process-config", {
        data: {content: exactLimitContent, clientMode: "file-input"}
    });

    expect(exactLimit.status()).toBe(200);
    await expect(exactLimit.json()).resolves.toMatchObject({
        content: exactLimitContent,
        warnings: []
    });

    const responses = await Promise.all([
        request.post("/api/remote/process-config", {
            data: {content: "font-size = 13", fileName: "config-a", clientMode: "file-input"}
        }),
        request.post("/api/remote/process-config", {
            data: {content: "font-size = 14", fileName: "config-b", clientMode: "file-input"}
        }),
        request.post("/api/remote/process-config", {
            data: {content: "background = 202020", fileName: "config-c", clientMode: "file-input"}
        })
    ]);

    expect(responses.map((response) => response.status())).toEqual([200, 200, 200]);
    await expect(responses[0].json()).resolves.toMatchObject({parsed: {fontSize: "13"}});
    await expect(responses[1].json()).resolves.toMatchObject({parsed: {fontSize: "14"}});
    await expect(responses[2].json()).resolves.toMatchObject({parsed: {background: "#202020"}});
});
