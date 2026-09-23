import { describe, expect, it } from "vitest";
import { cleanTerminalOutput, stripAnsi } from "../src/infra/process/ansi.js";
import { runPtyInteractive, spawnPtySession } from "../src/infra/process/pty.js";

describe("Terminal cleaning & ANSI stripping", () => {
  it("strips CSI color and cursor escape sequences", () => {
    const raw = "\x1b[31mRed Text\x1b[0m and \x1b[1;32mBold Green\x1b[0m\x1b[?25h";
    expect(stripAnsi(raw)).toBe("Red Text and Bold Green");
  });

  it("strips OSC terminal hyperlinks and window titles", () => {
    const raw = "Visit \x1b]8;;https://example.com\x1b\\Link\x1b]8;;\x1b\\ now!";
    expect(stripAnsi(raw)).toBe("Visit Link now!");
  });

  it("cleans terminal lines, normalizes carriage returns, and preserves unicode", () => {
    const raw = "Line 1\r\nLine 2\r\nWeekly limit  █████░░░░░░░░░░░░░░░  27% used\r\n";
    const cleaned = cleanTerminalOutput(raw);
    expect(cleaned).toContain("Weekly limit  █████░░░░░░░░░░░░░░░  27% used");
    expect(cleaned.split("\n")).toHaveLength(4);
  });
});

describe("PTY infrastructure", () => {
  it("spawns a PTY session using python bridge and reads output", async () => {
    const session = spawnPtySession({
      executable: "python3",
      args: ["-c", "import sys; print('PTY_READY'); sys.stdout.flush()"],
      timeoutMs: 5000,
    });

    let output = "";
    const received = new Promise<void>((resolve) => {
      session.onData((chunk) => {
        output += chunk;
        if (output.includes("PTY_READY")) {
          resolve();
        }
      });
    });

    await received;
    expect(output).toContain("PTY_READY");
    session.kill();
  });

  it("interacts bidirectionally with a process via runPtyInteractive", async () => {
    const output = await runPtyInteractive({
      executable: "python3",
      args: [
        "-c",
        `
import sys
print("PROMPT>")
sys.stdout.flush()
line = sys.stdin.readline().strip()
print(f"ECHO:{line}")
sys.stdout.flush()
`,
      ],
      timeoutMs: 5000,
      interact: async (session, getOutput) => {
        // Wait for PROMPT>
        for (let i = 0; i < 40; i++) {
          if (getOutput().includes("PROMPT>")) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        session.write("hello_pty\n");
        // Wait for ECHO:hello_pty
        for (let i = 0; i < 40; i++) {
          if (getOutput().includes("ECHO:hello_pty")) break;
          await new Promise((r) => setTimeout(r, 50));
        }
      },
    });

    expect(output).toContain("ECHO:hello_pty");
  });
});
