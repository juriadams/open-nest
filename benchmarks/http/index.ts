import { $ } from "bun";
import port from "get-port";
import { oraPromise as promise } from "ora";

if (!Bun.which("oha")) {
  console.error(
    "`oha` is not installed. Please install it with `brew install oha`.",
  );

  process.exit(1);
}

const PORTS = {
  BUN: await port(),
  NODE: await port(),
};

// Spawn a Bun server in a child process.
const bun = Bun.spawn(["bun", `${import.meta.dir}/servers/bun.ts`], {
  cwd: import.meta.dir,
  stdout: "ignore",
  stderr: "inherit",
  env: {
    ...process.env,
    PORT: String(PORTS.BUN),
  },
});

// Spawn a Node server in a child process.
const node = Bun.spawn(
  [
    "node",
    "--no-strip-types",
    "--import",
    "tsx",
    `${import.meta.dir}/servers/node.ts`,
  ],
  {
    cwd: import.meta.dir,
    stdout: "ignore",
    stderr: "inherit",
    env: {
      ...process.env,
      PORT: String(PORTS.NODE),
    },
  },
);

try {
  // Wait for the servers to start.
  await Bun.sleep(500);

  // Warm up the Bun server.
  await promise(
    $`oha -n 1000 -c 10 --no-tui --output-format json http://127.0.0.1:${PORTS.BUN}/health`.quiet(),
    { text: "Warming up Bun server... (1000 req, 10 concurrent)" },
  );

  // Warm up the Node server.
  await promise(
    $`oha -n 1000 -c 10 --no-tui --output-format json http://127.0.0.1:${PORTS.NODE}/health`.quiet(),
    { text: "Warming up Node server... (1000 req, 10 concurrent)" },
  );

  // Wait for the system to settle.
  await promise(Bun.sleep(5_000), { text: "Waiting for system to settle..." });

  // Benchmark the Bun server.
  const bun = await promise(
    $`oha -z 30s -c 50 -w --no-tui --output-format json http://127.0.0.1:${PORTS.BUN}/health`.json(),
    { text: "Benchmarking Bun server... (unlimited req, 30s, 50 concurrent)" },
  ).then((report) => report.summary.requestsPerSec as number);

  // Wait for the system to settle.
  await promise(Bun.sleep(5_000), { text: "Waiting for system to settle..." });

  // Benchmark the Node server.
  const node = await promise(
    $`oha -z 30s -c 50 -w --no-tui --output-format json http://127.0.0.1:${PORTS.NODE}/health`.json(),
    { text: "Benchmarking Node server... (unlimited req, 30s, 50 concurrent)" },
  ).then((report) => report.summary.requestsPerSec as number);

  console.table({
    bun: { "req/s": bun.toFixed(3) },
    node: { "req/s": node.toFixed(3) },
  });
} finally {
  bun.kill();
  node.kill();
}
