#!/usr/bin/env node

/**
 * @file qcli.js
 * @description The main application file for the 'Quantum CLI'. It will handle command parsing, dispatching, and interaction with the Q-Script runtime.
 */

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

// A placeholder for the Q-Script runtime. In a real application, this would
// be a more complex module responsible for parsing and executing a custom script language.
const qScriptRuntime = {
    /**
     * Executes a Q-Script file.
     * @param {string} filePath - The path to the .q script file.
     * @param {object} options - Execution options.
     */
    execute: (filePath, options) => {
        console.log(chalk.cyan(`[Q-Runtime] Initializing for script: ${path.basename(filePath)}`));
        if (!fs.existsSync(filePath)) {
            console.error(chalk.red.bold(`\nError: Script file not found.`));
            console.error(`  Path: ${filePath}`);
            process.exit(1);
        }
        try {
            const scriptContent = fs.readFileSync(filePath, 'utf8');
            console.log(chalk.green(`[Q-Runtime] Successfully loaded script.`));
            console.log(chalk.gray('--- SCRIPT PREVIEW ---'));
            const preview = scriptContent.split('\n').slice(0, 5).join('\n');
            console.log(chalk.gray(preview + (scriptContent.split('\n').length > 5 ? '\n...' : '')));
            console.log(chalk.gray('----------------------'));
            
            // Simulate asynchronous execution
            console.log(chalk.yellow('[Q-Runtime] Executing script...'));
            setTimeout(() => {
                console.log(chalk.green.bold('[Q-Runtime] Execution finished successfully.'));
            }, 1200);

        } catch (error) {
            console.error(chalk.red(`[Q-Runtime] Failed to read or execute script: ${error.message}`));
            process.exit(1);
        }
    }
};

/**
 * Handles the 'build' command to create a static production version of the terminal app.
 * @param {object} argv - The parsed command-line arguments.
 */
const handleBuild = (argv) => {
    console.log(chalk.cyan.bold('🚀 Starting Quantum Terminal build...'));
    const startTime = Date.now();
    const outDir = path.resolve(argv.out);

    try {
        console.log(`[1/4] Cleaning output directory: ${chalk.yellow(outDir)}`);
        if (fs.existsSync(outDir)) {
            fs.rmSync(outDir, { recursive: true, force: true });
        }
        fs.mkdirSync(outDir, { recursive: true });

        console.log('[2/4] Copying core assets...');
        // In a real build, you'd copy HTML, CSS, JS from a 'src' directory.
        // We'll create some placeholder files for this example.
        const srcDir = path.resolve(process.cwd(), 'src'); // Assuming a 'src' dir exists
        if (!fs.existsSync(srcDir)) {
            fs.mkdirSync(srcDir);
            fs.writeFileSync(path.join(srcDir, 'index.html'), '<h1>Welcome to Quantum Terminal</h1><script src="app.js"></script>');
            fs.writeFileSync(path.join(srcDir, 'app.js'), 'console.log("Quantum Terminal Loaded");');
            fs.writeFileSync(path.join(srcDir, 'style.css'), 'body { background: #111; color: #0f0; font-family: monospace; }');
        }
        fs.copyFileSync(path.join(srcDir, 'index.html'), path.join(outDir, 'index.html'));
        fs.copyFileSync(path.join(srcDir, 'style.css'), path.join(outDir, 'style.css'));

        console.log('[3/4] Bundling and minifying JavaScript...');
        // Simulate a bundling process
        const appJsContent = fs.readFileSync(path.join(srcDir, 'app.js'), 'utf8');
        const bundledJs = `/* Quantum Terminal Bundle - ${new Date().toISOString()} */\n(function(){${appJsContent.trim()}})();`;
        fs.writeFileSync(path.join(outDir, 'app.js'), bundledJs);
        
        console.log('[4/4] Finalizing build...');
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(chalk.green.bold(`\n✅ Build successful! (${duration}s)`));
        console.log(`   Static assets are ready in: ${chalk.yellow(outDir)}`);

    } catch (error) {
        console.error(chalk.red.bold(`\n❌ Build failed: ${error.message}`));
        process.exit(1);
    }
};

/**
 * Handles the 'serve' command to run a local development server.
 * @param {object} argv - The parsed command-line arguments.
 */
const handleServe = (argv) => {
    const port = argv.port;
    const root = path.resolve(argv.root);

    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        console.error(chalk.red.bold('Error: Root directory for serving does not exist or is not a directory.'));
        console.error(`  Path: ${root}`);
        console.log(chalk.yellow('\nDid you forget to run `qcli build` first?'));
        process.exit(1);
    }

    const server = http.createServer((req, res) => {
        const filePath = path.join(root, req.url === '/' ? 'index.html' : req.url);
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end(`<h1>404 Not Found</h1><p>The resource ${req.url} was not found.</p>`, 'utf-8');
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(chalk.red.bold(`Error: Port ${port} is already in use.`));
            console.log(chalk.yellow(`Try using a different port with the --port option.`));
        } else {
            console.error(chalk.red.bold(`Server error: ${err.message}`));
        }
        process.exit(1);
    });

    server.listen(port, () => {
        console.log(chalk.cyan.bold('🔥 Quantum Terminal development server is running.'));
        console.log(`\n  Serving content from: ${chalk.yellow(root)}`);
        console.log(`  Local:   ${chalk.green(`http://localhost:${port}`)}`);
        console.log('\nPress Ctrl+C to stop the server.');
    });
};

/**
 * Main CLI entry point.
 */
function main() {
    yargs(hideBin(process.argv))
        .scriptName('qcli')
        .usage('Usage: $0 <command> [options]')
        .command(
            'run <file>',
            'Execute a Q-Script file using the Q-Script runtime',
            (yargs) => {
                return yargs.positional('file', {
                    describe: 'Path to the .q script file to execute',
                    type: 'string',
                    normalize: true,
                });
            },
            (argv) => {
                const filePath = path.resolve(argv.file);
                qScriptRuntime.execute(filePath, {});
            }
        )
        .command(
            'build',
            'Build the static assets for the Quantum Terminal app',
            (yargs) => {
                return yargs.option('out', {
                    alias: 'o',
                    describe: 'Output directory for the build artifacts',
                    type: 'string',
                    default: 'dist',
                });
            },
            handleBuild
        )
        .command(
            'serve',
            'Run a local development server for the terminal app',
            (yargs) => {
                return yargs
                    .option('port', {
                        alias: 'p',
                        describe: 'Port to run the server on',
                        type: 'number',
                        default: 8080,
                    })
                    .option('root', {
                        alias: 'r',
                        describe: 'Root directory to serve files from',
                        type: 'string',
                        default: 'dist',
                    });
            },
            handleServe
        )
        .demandCommand(1, chalk.red('You must provide a valid command.'))
        .alias('h', 'help')
        .alias('v', 'version')
        .strict()
        .help()
        .wrap(yargs.terminalWidth())
        .fail((msg, err, yargs) => {
            if (err) {
                console.error(chalk.red.bold('\nAn unexpected error occurred:'));
                console.error(err.stack);
            } else {
                console.error(chalk.red.bold('\nError:'), chalk.red(msg));
                console.error('\n' + yargs.help());
            }
            process.exit(1);
        })
        .argv;
}

if (require.main === module) {
    main();
}