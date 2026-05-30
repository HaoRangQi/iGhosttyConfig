type FileSystemFileHandleLike = {
    name: string;
    kind?: string;
    getFile: () => Promise<File>;
    createWritable?: () => Promise<{
        write: (data: string) => Promise<void>;
        close: () => Promise<void>;
    }>;
};

type WindowWithFilePicker = Window & {
    showOpenFilePicker?: (options?: {
        multiple?: boolean;
        types?: Array<{
            description: string;
            accept: Record<string, string[]>;
        }>;
    }) => Promise<FileSystemFileHandleLike[]>;
};

export interface BrowserConfigFile {
    fileName: string;
    content: string;
    writable: boolean;
    handle: FileSystemFileHandleLike | null;
    source: "file-system-access" | "file-input";
}

const pickerOptions = {
    multiple: false,
    types: [
        {
            description: "Ghostty config",
            accept: {
                "text/plain": [".ghostty", ".conf", ".config", ".txt", ""]
            }
        }
    ]
};

export function supportsWritableBrowserFiles() {
    return typeof window !== "undefined" && typeof(window as WindowWithFilePicker).showOpenFilePicker === "function";
}

export async function openWritableBrowserConfigFile(): Promise<BrowserConfigFile> {
    if (typeof window === "undefined") throw new Error("This browser does not support direct file write-back.");
    const picker = (window as WindowWithFilePicker).showOpenFilePicker;
    if (!picker) throw new Error("This browser does not support direct file write-back.");

    const [handle] = await picker(pickerOptions);
    const file = await handle.getFile();

    return {
        fileName: file.name || handle.name || "config",
        content: await file.text(),
        writable: typeof handle.createWritable === "function",
        handle,
        source: "file-system-access"
    };
}

export async function readBrowserUploadFile(file: File): Promise<BrowserConfigFile> {
    return {
        fileName: file.name || "config",
        content: await file.text(),
        writable: false,
        handle: null,
        source: "file-input"
    };
}

export async function writeBrowserConfigFile(handle: FileSystemFileHandleLike, content: string) {
    if (!handle.createWritable) throw new Error("This file handle cannot be written.");
    const writable = await handle.createWritable();
    await writable.write(content.endsWith("\n") ? content : `${content}\n`);
    await writable.close();
}

export function downloadTextFile(content: string, fileName = "config") {
    const file = new File([content.endsWith("\n") ? content : `${content}\n`], fileName, {type: "text/plain"});
    const link = document.createElement("a");
    const url = URL.createObjectURL(file);
    link.href = url;
    link.download = file.name;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
