import adapter from "@sveltejs/adapter-node";
import {vitePreprocess} from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
    // Consult https://kit.svelte.dev/docs/integrations#preprocessors
    // for more information about preprocessors
    preprocess: vitePreprocess(),
    compilerOptions: {
        runes: true
    },
    kit: {
        adapter: adapter(),
        paths: {
            // The commented out part below is if I serve it under zerebos.github.io/<repo>
            // then the BASE_PATH would be set in the workflow to /<repo>
            // but for this project it is being aliased/served at a subdomain root
            base: "" // process.argv.includes("dev") ? "" : process.env.BASE_PATH
        }
    }
};

export default config;
