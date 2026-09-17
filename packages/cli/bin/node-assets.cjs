#!/usr/bin/env node

if (require.main === module) {
    import("../dist/cli.js")
        .then(({ runCliAsync }) => runCliAsync(process.argv.slice(2)))
        .catch((error) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        });
}
