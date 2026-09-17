import { createDurationFormatter, formatBytes } from "./format";

export function startBenchmark(): () => string {
    const startedAt = process.hrtime.bigint();
    const initialCpuUsage = process.cpuUsage();

    return () => {
        const elapsedMilliseconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const cpuUsage = process.cpuUsage(initialCpuUsage);
        const memoryUsage = process.memoryUsage();
        const resourceUsage = process.resourceUsage();
        const formatDuration = createDurationFormatter(elapsedMilliseconds);

        return [
            "Benchmark:",
            `  Completion time: ${formatDuration(elapsedMilliseconds)}`,
            `  CPU time (user): ${formatDuration(cpuUsage.user / 1_000)}`,
            `  CPU time (system): ${formatDuration(cpuUsage.system / 1_000)}`,
            `  RSS: ${formatBytes(memoryUsage.rss)}`,
            `  Peak RSS (process lifetime): ${formatBytes(resourceUsage.maxRSS * 1_024)}`,
            `  Heap used: ${formatBytes(memoryUsage.heapUsed)}`,
        ].join("\n");
    };
}
