const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });

const mode = process.argv[2] || "normal";

if (mode === "hang") {
  // Never respond, keep alive
  setInterval(() => {}, 10000);
} else {
  rl.on("line", (line) => {
    try {
      const req = JSON.parse(line);
      if (req.method === "initialize") {
        // Emit an unsolicited notification first
        process.stdout.write(
          `${JSON.stringify({
            method: "remoteControl/status/changed",
            params: { status: "disabled" },
          })}\n`,
        );

        // Send initialize response
        process.stdout.write(
          `${JSON.stringify({
            id: req.id,
            result: { codexHome: "/mock", userAgent: "mock" },
          })}\n`,
        );
      } else if (req.method === "account/rateLimits/read") {
        process.stdout.write(
          `${JSON.stringify({
            id: req.id,
            result: {
              ordinaryUsageAllowed: true,
              rateLimits: {
                limitId: "codex",
                limitName: null,
                normalModelSlug: null,
                primary: {
                  usedPercent: 40,
                  windowDurationMins: 300,
                  resetsAt: 1789461659,
                },
                secondary: {
                  usedPercent: 12,
                  windowDurationMins: 10080,
                  resetsAt: 1789895223,
                },
                credits: null,
                spendControlReached: false,
                planType: "team",
                rateLimitReachedType: null,
              },
              rateLimitsByLimitId: null,
              rateLimitResetCredits: { availableCount: 1 },
              accountId: "mock-account-id",
              rateLimitUpsell: null,
            },
          })}\n`,
        );
      } else if (req.method === "simulate_error") {
        process.stdout.write(
          `${JSON.stringify({
            id: req.id,
            error: { code: -32600, message: "Invalid request payload" },
          })}\n`,
        );
      }
    } catch {
      // Ignore unparseable lines
    }
  });
}
