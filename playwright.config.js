import {defineConfig, devices} from "@playwright/test";

export default defineConfig({
    testDir: "tests/e2e",
    fullyParallel: true,
    reporter: "list",
    use: {
        baseURL: "http://127.0.0.1:4173",
        trace: "retain-on-failure"
    },
    webServer: {
        command: "npm run build && PUBLIC_GHOSTTY_CONFIG_MODE=remote HOST=127.0.0.1 PORT=4173 BODY_SIZE_LIMIT=2M npm run start",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
        timeout: 120_000
    },
    projects: [
        {
            name: "chromium",
            use: {...devices["Desktop Chrome"]}
        }
    ]
});
