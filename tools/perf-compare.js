#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');

const PROBE_PATH = path.join(__dirname, 'perf-probe.js');
const METRIC_NAMES = ['update', 'draw', 'updateEnemies', 'AutoBattle', 'hasLineOfSight', 'labels', 'minimap'];

const DEFAULTS = {
    seconds: 12,
    floor: 5,
    quality: 'high',
    auto: true,
    runs: 3
};

function parseBoolean(value, name) {
    if (value === true) return true;
    if (value === false) return false;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`${name} 必须是 true 或 false`);
}

function parseArgs(argv) {
    const args = { ...DEFAULTS };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--')) throw new Error(`未知参数: ${arg}`);

        const eqIndex = arg.indexOf('=');
        const key = arg.slice(2, eqIndex === -1 ? undefined : eqIndex);
        let value = eqIndex === -1 ? undefined : arg.slice(eqIndex + 1);

        if (key === 'auto' && value === undefined) {
            const next = argv[i + 1];
            if (next === 'true' || next === 'false') {
                value = next;
                i++;
            } else {
                value = 'true';
            }
        } else if (value === undefined) {
            value = argv[i + 1];
            if (value === undefined || value.startsWith('--')) throw new Error(`参数 ${arg} 缺少值`);
            i++;
        }

        if (key === 'seconds') args.seconds = Number(value);
        else if (key === 'floor') args.floor = Number(value);
        else if (key === 'quality') args.quality = value;
        else if (key === 'auto') args.auto = parseBoolean(value, '--auto');
        else if (key === 'runs') args.runs = Number(value);
        else throw new Error(`未知参数: --${key}`);
    }

    if (!Number.isFinite(args.seconds) || args.seconds <= 0) throw new Error('--seconds 必须是正数');
    if (!Number.isInteger(args.floor) || args.floor < 0) throw new Error('--floor 必须是非负整数');
    if (!['high', 'low'].includes(args.quality)) throw new Error('--quality 只支持 high 或 low');
    if (!Number.isInteger(args.runs) || args.runs <= 0) throw new Error('--runs 必须是正整数');

    return args;
}

function probeArgs(args) {
    const out = [
        PROBE_PATH,
        '--seconds', String(args.seconds),
        '--floor', String(args.floor),
        '--quality', args.quality
    ];
    if (args.auto) out.push('--auto');
    return out;
}

function runProbe(args, index) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, probeArgs(args), {
            cwd: path.resolve(__dirname, '..'),
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', code => {
            if (code !== 0) {
                reject(new Error(`perf-probe run ${index} 失败，退出码 ${code}\n${stderr.trim()}`));
                return;
            }
            try {
                const result = JSON.parse(stdout);
                resolve({
                    index,
                    metrics: result.metrics,
                    result
                });
            } catch (err) {
                reject(new Error(`perf-probe run ${index} JSON 解析失败: ${err.message}\n${stdout.slice(0, 500)}`));
            }
        });
    });
}

function average(values) {
    if (values.length === 0) return 0;
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function summarize(runs) {
    const summary = {};
    for (const name of METRIC_NAMES) {
        const metrics = runs.map(run => run.metrics[name]);
        summary[name] = {
            avgAvg: average(metrics.map(metric => metric.avg)),
            p95Avg: average(metrics.map(metric => metric.p95)),
            maxMax: Number(Math.max(...metrics.map(metric => metric.max)).toFixed(3)),
            callsAvg: average(metrics.map(metric => metric.n))
        };
    }
    return summary;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const runs = [];
    for (let i = 1; i <= args.runs; i++) {
        runs.push(await runProbe(args, i));
    }

    process.stdout.write(`${JSON.stringify({
        args,
        runs,
        summary: summarize(runs)
    }, null, 2)}\n`);
}

main().catch(err => {
    process.stderr.write(`perf-compare 失败: ${err.stack || err.message}\n`);
    process.exitCode = 1;
});
