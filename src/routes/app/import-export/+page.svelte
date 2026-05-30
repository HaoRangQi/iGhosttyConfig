<script lang="ts">
    import Group from "$lib/components/settings/Group.svelte";
    import Item from "$lib/components/settings/Item.svelte";
    import Separator from "$lib/components/settings/Separator.svelte";
    import {diff, load, keyToConfig, resetConfig} from "$lib/stores/config.svelte";
    import {alert as showAlert, confirm} from "$lib/stores/modals.svelte";
    import {isRemoteMode} from "$lib/utils/app-mode";
    import {
        downloadTextFile,
        openWritableBrowserConfigFile,
        readBrowserUploadFile,
        supportsWritableBrowserFiles,
        writeBrowserConfigFile,
        type BrowserConfigFile
    } from "$lib/utils/browser-file";
    import {stringifyConfig} from "$lib/utils/config-text";
    import {
        checkLocalGhosttyServer,
        readLocalGhosttyConfig,
        reloadLocalGhosttyConfig,
        saveLocalGhosttyConfig
    } from "$lib/utils/local-ghostty";
    import parse from "$lib/utils/parse";
    import {processRemoteConfig} from "$lib/utils/remote-config";
    import {
        buildShareUrl,
        decodeConfig,
        encodeConfig,
        getSharePayloadFromHash,
        MAX_SHARE_URL_LENGTH,
        removeSharePayloadFromHash
    } from "$lib/utils/share";
    import Page from "$lib/views/Page.svelte";
    import Button from "$lib/components/Button.svelte";
    import ShareComposerModal from "$lib/components/modals/ShareComposerModal.svelte";
    import SharedConfigModal from "$lib/components/modals/SharedConfigModal.svelte";
    import {onMount} from "svelte";
    import {error, success} from "$lib/stores/toasts.svelte";

    const LABEL_RESET_TIMEOUT_MS = 3000;

    let pasteConfigText = $state("Clipboard");
    let copyConfigText = $state("Clipboard");
    let localConfigPath = $state("");
    let localServerAvailable = $state(false);
    let localServerChecked = $state(false);
    let localActionPending = $state(false);
    let localStartChoiceMade = $state(false);
    let remoteActionPending = $state(false);
    let remoteFile = $state<BrowserConfigFile | null>(null);
    let remoteFileInput: HTMLInputElement = $state(null!);
    let remoteBrowserCanWrite = $state(false);

    let sharedConfigPreview = $state<string | null>(null);
    let sharedConfigParsed = $state<Record<string, string | string[]> | null>(null);
    let sharedConfigParseError = $state(false);
    let showSharedConfigModal = $state(false);

    let showShareComposer = $state(false);
    let shareUrl = $state<string | null>(null);
    let isShareTooLong = $state(false);

    const currentConfigDiff = $derived(diff());
    const hasExportableConfig = $derived(Object.keys(currentConfigDiff).length > 0);

    onMount(() => {
        maybeShowSharedConfigFromHash();
        remoteBrowserCanWrite = supportsWritableBrowserFiles();
        if (!isRemoteMode) void refreshLocalServerStatus();
        else localServerChecked = true;
        const handler = () => maybeShowSharedConfigFromHash();
        window.addEventListener("hashchange", handler);
        return () => window.removeEventListener("hashchange", handler);
    });

    async function refreshLocalServerStatus() {
        try {
            const status = await checkLocalGhosttyServer();
            localServerAvailable = status.ok;
            localConfigPath = status.configPath;
        }
        catch {
            localServerAvailable = false;
            localConfigPath = "";
        }
        finally {
            localServerChecked = true;
        }
    }

    function maybeShowSharedConfigFromHash() {
        const shareParam = getSharePayloadFromHash(window.location.hash);
        if (!shareParam) return;

        try {
            const decodedConfig = decodeConfig(shareParam);
            sharedConfigPreview = decodedConfig;

            // Try to parse for pretty display
            try {
                sharedConfigParsed = parse(decodedConfig);
                sharedConfigParseError = false;
            }
            catch {
                // Parsing failed, will fall back to raw text display
                sharedConfigParsed = null;
                sharedConfigParseError = true;
            }

            showSharedConfigModal = true;
        }
        catch {
            error("Failed to read shared config from URL");
            clearShareHashFromAddressBar();
        }
    }

    function clearShareHashFromAddressBar() {
        const cleanedHash = removeSharePayloadFromHash(window.location.hash);
        const nextUrl = `${window.location.pathname}${window.location.search}${cleanedHash}`;
        window.history.replaceState(null, "", nextUrl);
    }

    async function loadConfig(candidate: string, resetBeforeLoad = false): Promise<boolean> {
        let parsed;
        try {
            // TODO: remove this assertions when the return type of parse is fixed
            parsed = parse(candidate) as Parameters<typeof load>[0];
        }
        catch (parseError) {
            // eslint-disable-next-line no-console
            console.error(parseError);
            await showAlert({
                title: "Could not parse config",
                message: "Something went wrong while parsing your config. Please open an issue on GitHub.",
                buttonText: "Dismiss"
            });
            return false;
        }

        try {
            if (resetBeforeLoad) resetConfig();
            load(parsed);
        }
        catch (loadError) {
            // eslint-disable-next-line no-console
            console.error(loadError);
            await showAlert({
                title: "Could not load config",
                message: "Something went wrong while loading your parsed config. Please open an issue on GitHub.",
                buttonText: "Dismiss"
            });
            return false;
        }

        return true;
    }

    async function pasteConfig() {
        if (pasteConfigText === "Pasted!") return;

        try {
            const text = await window.navigator.clipboard.readText();
            pasteConfigText = "Pasted!";
            setTimeout(() => (pasteConfigText = "Clipboard"), LABEL_RESET_TIMEOUT_MS);
            const loaded = await loadConfig(text);
            if (loaded) success("Config loaded from clipboard");
        }
        catch {
            error("Clipboard access failed! Please paste manually or import from file.");
        }
    }

    let filePicker: HTMLInputElement;
    function openFilePicker() {
        filePicker.click();
    }

    function selectFile() {
        const file = filePicker.files![0];
        const reader = new FileReader();
        reader.addEventListener("load", (event) => {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            const loadedText = event.target?.result?.toString();
            if (!loadedText) return;
            void loadConfig(loadedText).then((didLoad) => {
                if (didLoad) success("Config loaded from file");
            });
        });
        reader.readAsText(file);
    }

    async function copyConfig() {
        if (!hasExportableConfig) {
            return;
        }
        if (copyConfigText === "Copied!") return;

        try {
            await window.navigator.clipboard.writeText(stringifyConfig(currentConfigDiff));
            copyConfigText = "Copied!";
            success("Config copied to clipboard");
            setTimeout(() => (copyConfigText = "Clipboard"), LABEL_RESET_TIMEOUT_MS);
        }
        catch {
            error("Clipboard access failed! Please copy manually or export to file.");
        }
    }

    function openShareComposer() {
        if (!hasExportableConfig) {
            return;
        }

        const config = stringifyConfig(currentConfigDiff, false);
        const encoded = encodeConfig(config);
        const nextShareUrl = buildShareUrl(window.location.origin, window.location.pathname, encoded);

        isShareTooLong = nextShareUrl.length > MAX_SHARE_URL_LENGTH;
        shareUrl = isShareTooLong ? null : nextShareUrl;
        showShareComposer = true;
    }

    function closeShareComposer() {
        showShareComposer = false;
        shareUrl = null;
        isShareTooLong = false;
    }

    async function copyConfigForFallback() {
        try {
            await window.navigator.clipboard.writeText(stringifyConfig(currentConfigDiff, false));
            return true;
        }
        catch {
            return false;
        }
    }

    async function importSharedConfig() {
        if (sharedConfigPreview) {
            const loaded = await loadConfig(sharedConfigPreview);
            if (loaded) success("Shared config imported");
        }
        closeSharedConfigModal();
    }

    function closeSharedConfigModal() {
        showSharedConfigModal = false;
        sharedConfigPreview = null;
        sharedConfigParsed = null;
        sharedConfigParseError = false;
        clearShareHashFromAddressBar();
    }

    function downloadConfig() {
        if (!hasExportableConfig) {
            return;
        }

        downloadTextFile(stringifyConfig(currentConfigDiff), "config");
        success("Config file downloaded");
    }

    async function loadRemoteConfigFile(candidate: BrowserConfigFile) {
        remoteActionPending = true;

        try {
            const processed = await processRemoteConfig({
                content: candidate.content,
                fileName: candidate.fileName,
                clientMode: candidate.source
            });
            remoteFile = candidate;
            const loaded = await loadConfig(processed.content, true);
            if (!loaded) return;

            localStartChoiceMade = true;
            if (processed.warnings.length) {
                error(processed.warnings.join(" "));
            }
            success(`Remote config processed: ${candidate.fileName}`);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Could not process remote config";
            error(message);
        }
        finally {
            remoteActionPending = false;
        }
    }

    async function openRemoteLocalConfig() {
        if (remoteActionPending) return;
        if (!remoteBrowserCanWrite) {
            remoteFileInput.click();
            return;
        }

        try {
            const file = await openWritableBrowserConfigFile();
            await loadRemoteConfigFile(file);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Could not open local config file";
            error(message);
        }
    }

    async function selectRemoteUploadFile() {
        const file = remoteFileInput.files?.[0];
        if (!file) return;
        await loadRemoteConfigFile(await readBrowserUploadFile(file));
        remoteFileInput.value = "";
    }

    function startNewRemoteConfig() {
        remoteFile = null;
        resetConfig();
        localStartChoiceMade = true;
        success("Started from a new default config");
    }

    function buildRemoteSaveText() {
        const configText = stringifyConfig(currentConfigDiff);
        const targetName = remoteFile?.fileName ?? "config";
        const changedKeys = Object.keys(currentConfigDiff);
        const diffPreview = changedKeys.length
            ? changedKeys.slice(0, 12).join(", ")
            : "No generated changes";
        const extra = changedKeys.length > 12 ? `, and ${changedKeys.length - 12} more` : "";
        return {
            configText,
            targetName,
            message: `Target: ${targetName}\nChanges: ${diffPreview}${extra}\n\nA backup download will be created before write-back when possible.`
        };
    }

    async function saveRemoteConfig() {
        if (!hasExportableConfig || remoteActionPending) return;
        remoteActionPending = true;

        try {
            const {configText, targetName, message} = buildRemoteSaveText();
            const shouldSave = await confirm({
                title: "Overwrite local Ghostty config?",
                message,
                confirmText: remoteFile?.writable ? "Write Back" : "Download File",
                cancelText: "Cancel"
            });

            if (!shouldSave) return;

            if (remoteFile?.handle && remoteFile.writable) {
                downloadTextFile(remoteFile.content, `${targetName}.backup`);
                await writeBrowserConfigFile(remoteFile.handle, configText);
                remoteFile = {
                    ...remoteFile,
                    content: configText
                };
                success(`Config written back: ${targetName}`);
                error("Remote browser mode cannot reload Ghostty automatically. Use Ghostty's reload config action manually.");
            }
            else {
                downloadTextFile(configText, targetName);
                success(`Config downloaded: ${targetName}`);
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Could not save remote config";
            error(message);
        }
        finally {
            remoteActionPending = false;
        }
    }

    async function loadLocalConfig() {
        if (localActionPending) return;
        localActionPending = true;

        try {
            const localConfig = await readLocalGhosttyConfig();
            localConfigPath = localConfig.configPath;
            if (!localConfig.exists || !localConfig.content.trim()) {
                resetConfig();
                success(`Local config is empty: ${localConfig.configPath}`);
                return;
            }

            const loaded = await loadConfig(localConfig.content, true);
            if (loaded) {
                localStartChoiceMade = true;
                success(`Local config loaded: ${localConfig.configPath}`);
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Could not read local Ghostty config";
            error(message);
        }
        finally {
            localActionPending = false;
        }
    }

    function startNewLocalConfig() {
        resetConfig();
        localStartChoiceMade = true;
        success("Started from a new default config");
    }

    async function saveLocalConfig() {
        if (!hasExportableConfig || localActionPending) return;
        localActionPending = true;

        try {
            const result = await saveLocalGhosttyConfig(stringifyConfig(currentConfigDiff));
            localConfigPath = result.configPath;

            if (result.reload.ok) {
                success(`Saved and reloaded Ghostty config: ${result.configPath}`);
            }
            else {
                success(`Saved Ghostty config: ${result.configPath}`);
                error("Ghostty reload was not confirmed. Use Ghostty's reload config action if the change is not visible yet.");
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Could not save local Ghostty config";
            error(message);
        }
        finally {
            localActionPending = false;
        }
    }

    async function reloadGhosttyConfig() {
        if (localActionPending) return;
        localActionPending = true;

        try {
            const result = await reloadLocalGhosttyConfig();
            if (result.ok) success("Ghostty config reload triggered");
            else error("Ghostty reload was not confirmed. Use Ghostty's reload config action manually.");
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Could not reload Ghostty config";
            error(message);
        }
        finally {
            localActionPending = false;
        }
    }

    function handleWindowKeydown(e: KeyboardEvent) {
        if (e.key !== "Escape") return;
        if (showShareComposer) closeShareComposer();
        else if (showSharedConfigModal) closeSharedConfigModal();
    }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<Page title="Import & Export">
    <Group flex={1}>
        {#if isRemoteMode && !localStartChoiceMade && !showSharedConfigModal}
            <div class="start-choice">
                <div class="start-copy">
                    <div class="start-title">Start a remote team editing session</div>
                    <div class="start-note">
                        Open a local Ghostty config in Chromium for write-back, upload a file for download-only fallback, or start fresh.
                    </div>
                    <div class="start-path">
                        {remoteBrowserCanWrite ? "Direct browser write-back is available." : "This browser will use upload/download fallback."}
                    </div>
                </div>
                <div class="button-group">
                    <Button
                        primary
                        onclick={openRemoteLocalConfig}
                        title="Open local Ghostty config"
                        disabled={remoteActionPending}
                    >Open Local Config</Button>
                    <Button
                        onclick={() => remoteFileInput.click()}
                        title="Upload config file"
                        disabled={remoteActionPending}
                    >Upload File</Button>
                    <Button
                        onclick={startNewRemoteConfig}
                        title="Start without reading local config"
                        disabled={remoteActionPending}
                    >New Config</Button>
                </div>
            </div>
            <Separator />
        {:else if !isRemoteMode && localServerAvailable && !localStartChoiceMade && !showSharedConfigModal}
            <div class="start-choice">
                <div class="start-copy">
                    <div class="start-title">Start with your local Ghostty config?</div>
                    <div class="start-note">Choose whether this editing session should import your existing file or begin from the default config.</div>
                    <div class="start-path">{localConfigPath}</div>
                </div>
                <div class="button-group">
                    <Button
                        primary
                        onclick={loadLocalConfig}
                        title="Read local Ghostty config"
                        disabled={localActionPending}
                    >Read Local</Button>
                    <Button
                        onclick={startNewLocalConfig}
                        title="Start without reading local config"
                        disabled={localActionPending}
                    >New Config</Button>
                </div>
            </div>
            <Separator />
        {/if}
        <div class="preview">
            {#if hasExportableConfig}
                <div class="row p2"># Config generated by Ghostty Config Studio</div>
            {:else}
                <div class="row p2"># No changes to the default config yet</div>
            {/if}
            <div class="row">&nbsp;</div>

            {#if hasExportableConfig}
                {#each Object.entries(currentConfigDiff) as [key, value], i (i)}
                    {#if Array.isArray(value)}
                        {#each value as val, v (v)}
                        <div class="row"><span class="p4">{key}</span> = <span class="p5">{val}</span></div>
                        {/each}
                    {:else}
                        <div class="row"><span class="p4">{key}</span> = <span class="p5">{value}</span></div>
                    {/if}
                {/each}
            {/if}
        </div>
        <Separator />
        <Item name="Import">
            <div class="button-group">
                <Button onclick={pasteConfig} title="Paste">{pasteConfigText}</Button>
                <input id="config-input" type="file" onchange={selectFile} bind:this={filePicker} />
                <Button onclick={openFilePicker} title="Upload">File...</Button>
            </div>
        </Item>
        <Separator />
        {#if isRemoteMode}
        <Item
            name="Remote Team"
            note={remoteFile
                ? `${remoteFile.fileName} · ${remoteFile.writable ? "write-back enabled" : "download-only fallback"}`
                : remoteBrowserCanWrite
                    ? "Chromium file access is available. Open a local config file to enable browser write-back."
                    : "File write-back is not available in this browser. Upload and download replacement files instead."}
        >
            <input id="remote-config-input" type="file" onchange={selectRemoteUploadFile} bind:this={remoteFileInput} />
            <div class="button-group">
                <Button
                    onclick={openRemoteLocalConfig}
                    title="Open local Ghostty config"
                    disabled={remoteActionPending}
                >Open Local Config</Button>
                <Button
                    onclick={() => remoteFileInput.click()}
                    title="Upload config file"
                    disabled={remoteActionPending}
                >Upload File</Button>
                <Button
                    primary
                    onclick={saveRemoteConfig}
                    title={hasExportableConfig ? "Review and save remote config" : "No changes yet!"}
                    disabled={!hasExportableConfig || remoteActionPending}
                >Review & Save</Button>
            </div>
        </Item>
        <Separator />
        {:else}
        <Item
            name="Local Ghostty"
            note={localServerAvailable
                ? `Editing ${localConfigPath}`
                : localServerChecked
                    ? "Start the local companion server with npm run dev:local to read and save the Ghostty config file directly."
                    : "Checking local companion server..."}
        >
            <div class="button-group">
                <Button
                    onclick={refreshLocalServerStatus}
                    title="Check local server"
                    disabled={localActionPending}
                >Check</Button>
                <Button
                    onclick={loadLocalConfig}
                    title={localServerAvailable ? "Read local Ghostty config" : "Local server is not running"}
                    disabled={!localServerAvailable || localActionPending}
                >Read Local</Button>
                <Button
                    primary
                    onclick={saveLocalConfig}
                    title={hasExportableConfig ? "Save to local Ghostty config" : "No changes yet!"}
                    disabled={!localServerAvailable || !hasExportableConfig || localActionPending}
                >Save Local</Button>
                <Button
                    onclick={reloadGhosttyConfig}
                    title={localServerAvailable ? "Reload Ghostty config" : "Local server is not running"}
                    disabled={!localServerAvailable || localActionPending}
                >Reload</Button>
            </div>
        </Item>
        <Separator />
        {/if}
        <Item name="Export">
            <div class="button-group">
                <Button
                    onclick={copyConfig}
                    title={hasExportableConfig ? "Copy" : "No changes yet!"}
                    disabled={!hasExportableConfig}
                >{copyConfigText}</Button>
                <Button
                    onclick={downloadConfig}
                    title={hasExportableConfig ? "Download" : "No changes yet!"}
                    disabled={!hasExportableConfig}
                >File...</Button>
                <Button
                    primary
                    onclick={openShareComposer}
                    title={hasExportableConfig ? "Share your config" : "No changes yet!"}
                    disabled={!hasExportableConfig}
                >Share...</Button>
            </div>
        </Item>
    </Group>
</Page>

{#if showShareComposer}
<ShareComposerModal
    isTooLong={isShareTooLong}
    {shareUrl}
    onclose={closeShareComposer}
    ondownload={downloadConfig}
    oncopyconfigtext={copyConfigForFallback}
/>
{/if}

{#if showSharedConfigModal}
<SharedConfigModal
    parsedConfig={sharedConfigParsed}
    previewText={sharedConfigPreview}
    parseError={sharedConfigParseError}
    keyFormatter={keyToConfig}
    onclose={closeSharedConfigModal}
    onimport={importSharedConfig}
/>
{/if}

<style>
.preview {
    background: var(--config-bg);
    font-family: var(--config-font-family);
    font-size: var(--config-font-size);
    color: var(--config-fg);
    min-height: 200px;
    overflow-y: auto;
    padding: 8px;
    border-radius: var(--radius-level-3);
    border: 1px solid rgba(0, 0, 0, 0.5);
    box-shadow: 0 0 1px rgba(255, 255, 255, 0.5) inset;
    flex: 1;
    user-select: text;
}

.preview .row {
    display: block;
    white-space: pre;
}

/* .bold {font-weight: 700;} */

/* .fg {color: var(--config-fg);} */

/* .p0 {color: var(--config-palette-0);} */
/* .p1 {color: var(--config-palette-1);} */
.p2 {color: var(--config-palette-2);}
/* .p3 {color: var(--config-palette-3);} */
.p4 {color: var(--config-palette-4);}
.p5 {color: var(--config-palette-5);}
/* .p6 {color: var(--config-palette-6);}
.p7 {color: var(--config-palette-7);}
.p8 {color: var(--config-palette-8);}
.p9 {color: var(--config-palette-9);}
.p10 {color: var(--config-palette-10);}
.p11 {color: var(--config-palette-11);}
.p12 {color: var(--config-palette-12);} */
/* .p13 {color: var(--config-palette-13);}
.p14 {color: var(--config-palette-14);}
.p15 {color: var(--config-palette-15);} */


#config-input,
#remote-config-input {
    display: none;
}

.button-group {
    display: flex;
    gap: 12px;
}

.start-choice {
    background: var(--bg-level-2);
    border: 1px solid var(--border-level-2);
    border-radius: var(--radius-level-3);
    padding: 14px;
    display: flex;
    justify-content: space-between;
    gap: 16px;
}

.start-copy {
    min-width: 0;
}

.start-title {
    font-weight: 600;
    margin-bottom: 4px;
}

.start-note, .start-path {
    color: var(--font-color-muted);
    font-size: 0.9rem;
    line-height: 1.4;
}

.start-path {
    margin-top: 6px;
    word-break: break-all;
}

@media (max-width: 700px) {
    .start-choice {
        flex-direction: column;
    }
}

</style>
