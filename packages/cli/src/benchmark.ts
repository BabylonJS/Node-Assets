export function startBenchmark(): () => string {
    const startedAt = process.hrtime.bigint();
    const initialCpuUsage = process.cpuUsage();

    return () => {
        const elapsedMilliseconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const cpuUsage = process.cpuUsage(initialCpuUsage);
        const memoryUsage = process.memoryUsage();
        const resourceUsage = process.resourceUsage();

        return [
            "Benchmark:",
            `  Completion time: ${elapsedMilliseconds.toFixed(2)} ms`,
            `  CPU time (user): ${(cpuUsage.user / 1_000).toFixed(2)} ms`,
            `  CPU time (system): ${(cpuUsage.system / 1_000).toFixed(2)} ms`,
            `  RSS: ${memoryUsage.rss} bytes`,
            `  Peak RSS (process lifetime): ${resourceUsage.maxRSS * 1_024} bytes`,
            `  Heap used: ${memoryUsage.heapUsed} bytes`,
        ].join("\n");
    };
}
