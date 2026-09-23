#!/usr/bin/env python3
"""
Lightweight POSIX PTY bridge for AI Limits Dashboard.
Multiplexes stdio between parent Node process and child process in a real pseudo-terminal.
Zero external dependencies (uses Python standard library only).
"""

import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: pty-bridge.py [--cols N] [--rows M] [--cwd DIR] -- <cmd> [args...]\n")
        sys.exit(1)

    cols = 120
    rows = 35
    cwd = None
    args = []

    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg == "--cols" and i + 1 < len(sys.argv):
            cols = int(sys.argv[i + 1])
            i += 2
        elif arg == "--rows" and i + 1 < len(sys.argv):
            rows = int(sys.argv[i + 1])
            i += 2
        elif arg == "--cwd" and i + 1 < len(sys.argv):
            cwd = sys.argv[i + 1]
            i += 2
        elif arg == "--":
            args = sys.argv[i + 1 :]
            break
        else:
            args = sys.argv[i:]
            break

    if not args:
        sys.stderr.write("pty-bridge.py: No command specified\n")
        sys.exit(1)

    master, slave = pty.openpty()

    # Set window size
    try:
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    except OSError:
        pass

    pid = os.fork()
    if pid == 0:
        # Child process
        os.close(master)
        os.setsid()

        # Connect slave PTY to stdio
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        if slave > 2:
            os.close(slave)

        if cwd:
            try:
                os.chdir(cwd)
            except OSError:
                pass

        os.environ["TERM"] = "xterm-256color"
        os.environ["COLUMNS"] = str(cols)
        os.environ["LINES"] = str(rows)

        try:
            os.execvp(args[0], args)
        except Exception as e:
            sys.stderr.write(f"execvp failed: {e}\n")
            sys.exit(127)

    # Parent process
    os.close(slave)

    # Make master non-blocking
    flags = fcntl.fcntl(master, fcntl.F_GETFL)
    fcntl.fcntl(master, fcntl.F_SETFL, flags | os.O_NONBLOCK)

    # Make stdin non-blocking
    flags = fcntl.fcntl(sys.stdin.fileno(), fcntl.F_GETFL)
    fcntl.fcntl(sys.stdin.fileno(), fcntl.F_SETFL, flags | os.O_NONBLOCK)

    def cleanup(signum=None, frame=None):
        try:
            os.killpg(pid, signal.SIGTERM)
        except OSError:
            pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, cleanup)
    signal.signal(signal.SIGINT, cleanup)

    exit_code = 0
    stdin_closed = False

    try:
        while True:
            rlist = [master]
            if not stdin_closed:
                rlist.append(sys.stdin.fileno())

            r, _, _ = select.select(rlist, [], [], 0.05)

            if master in r:
                try:
                    data = os.read(master, 8192)
                    if not data:
                        break
                    sys.stdout.buffer.write(data)
                    sys.stdout.buffer.flush()
                except OSError:
                    break

            if not stdin_closed and sys.stdin.fileno() in r:
                try:
                    data = sys.stdin.buffer.read(8192)
                    if not data:
                        stdin_closed = True
                    else:
                        os.write(master, data)
                except OSError:
                    stdin_closed = True

            # Check child process status
            res = os.waitpid(pid, os.WNOHANG)
            if res[0] != 0:
                status = res[1]
                if os.WIFEXITED(status):
                    exit_code = os.WEXITSTATUS(status)
                elif os.WIFSIGNALED(status):
                    exit_code = 128 + os.WTERMSIG(status)
                else:
                    exit_code = 1

                # Flush any remaining master bytes
                while True:
                    try:
                        data = os.read(master, 8192)
                        if not data:
                            break
                        sys.stdout.buffer.write(data)
                        sys.stdout.buffer.flush()
                    except OSError:
                        break
                break

    finally:
        try:
            os.close(master)
        except OSError:
            pass
        try:
            os.killpg(pid, signal.SIGKILL)
        except OSError:
            pass

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
