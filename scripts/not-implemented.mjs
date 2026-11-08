const suite = process.argv[2] ?? "unknown-suite";

console.error(`${suite}: not implemented; this suite cannot report success`);
process.exitCode = 2;
