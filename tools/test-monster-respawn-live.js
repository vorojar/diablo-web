#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const probe = path.join(__dirname, 'perf-probe.js');
const cdpPort = process.argv.includes('--cdp-port')
    ? process.argv[process.argv.indexOf('--cdp-port') + 1]
    : '10150';

const result = spawnSync(process.execPath, [
    probe,
    '--seconds', '4',
    '--floor', '5',
    '--quality', 'low',
    '--auto',
    '--kill-all',
    '--width', '1280',
    '--height', '720',
    '--cdp-port', cdpPort
], {
    cwd: root,
    encoding: 'utf8'
});

if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
}

const data = JSON.parse(result.stdout);
if (data.before.alive !== 0) {
    throw new Error(`FAIL: live respawn setup should start from zero alive enemies, got ${data.before.alive}`);
}
if (data.after.alive < 6) {
    throw new Error(`FAIL: dynamic respawn did not refill after kill-all, got ${data.after.alive} alive enemies`);
}

console.log(`PASS: live monster respawn after kill-all (${data.after.alive} alive)`);
