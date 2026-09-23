import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray } from "electron";
import { getCliArgs, isCliInvocation, runCliFromMain } from "./cli-handler.js";
import { installCliIntegration } from "./cli-installer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Early check: if executed with CLI commands or flags from terminal, run CLI directly
const cliArgs = getCliArgs(process.argv, app.isPackaged);
if (isCliInvocation(cliArgs)) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("headless");

  app.whenReady().then(async () => {
    try {
      await runCliFromMain(cliArgs, __dirname, app);
    } catch (err) {
      process.stderr.write(`CLI execution failed: ${err}\n`);
      app.exit(1);
    }
  });
} else {
  let mainWindow = null;
  let tray = null;
  let serverInstance = null;
  let cliContext = null;

  const serverPath = join(__dirname, "..", "dist", "server", "index.js");
  const contextPath = join(__dirname, "..", "dist", "cli", "context.js");
  const iconPath = join(__dirname, "..", "assets", "icon.png");

  async function startBackend() {
    const { createCliContext } = await import(pathToFileURL(contextPath).href);
    const { startServer } = await import(pathToFileURL(serverPath).href);

    cliContext = createCliContext();
    // Bind dynamically to an available loopback port
    serverInstance = await startServer(cliContext, {
      host: "127.0.0.1",
      port: 0,
    });

    return serverInstance.url;
  }

  function createApplicationMenu(serverUrl) {
    const template = [
      {
        label: "File",
        submenu: [
          {
            label: "Refresh Data",
            accelerator: "CmdOrCtrl+R",
            click: () => {
              mainWindow?.reload();
            },
          },
          {
            label: "Open in Browser",
            click: () => {
              shell.openExternal(serverUrl);
            },
          },
          { type: "separator" },
          {
            label: "Install CLI to PATH ('quotalens', 'ai-limits')",
            click: async () => {
              const res = await installCliIntegration({ silent: false });
              if (res.success) {
                dialog.showMessageBox(mainWindow, {
                  type: "info",
                  title: "QuotaLens CLI Installed",
                  message: "Command line tools configured successfully!",
                  detail: `You can now use 'quotalens' and 'ai-limits' directly from any terminal window.\n\nInstalled locations:\n${res.paths.join("\n")}`,
                });
              } else {
                dialog.showMessageBox(mainWindow, {
                  type: "error",
                  title: "Installation Failed",
                  message: "Could not install CLI commands to PATH",
                  detail: res.message,
                });
              }
            },
          },
          { type: "separator" },
          {
            label: "Quit QuotaLens",
            accelerator: "CmdOrCtrl+Q",
            click: () => {
              app.quit();
            },
          },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
          {
            label: "Toggle Developer Tools",
            accelerator: "CmdOrCtrl+Shift+I",
            click: () => {
              mainWindow?.webContents.toggleDevTools();
            },
          },
        ],
      },
      {
        label: "Help",
        submenu: [
          {
            label: "GitHub Repository",
            click: () => {
              shell.openExternal("https://github.com/NourHayik/QuotaLens");
            },
          },
          {
            label: "Report Issue",
            click: () => {
              shell.openExternal("https://github.com/NourHayik/QuotaLens/issues");
            },
          },
        ],
      },
    ];

    return Menu.buildFromTemplate(template);
  }

  function createTray(icon) {
    if (!icon || tray) return;

    try {
      const trayIcon = icon.resize({ width: 20, height: 20 });
      tray = new Tray(trayIcon);
      tray.setToolTip("QuotaLens — AI Limits Dashboard");

      const contextMenu = Menu.buildFromTemplate([
        {
          label: "Show QuotaLens",
          click: () => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.focus();
            }
          },
        },
        {
          label: "Refresh Dashboard",
          click: () => {
            mainWindow?.reload();
          },
        },
        { type: "separator" },
        {
          label: "Quit",
          click: () => {
            app.quit();
          },
        },
      ]);

      tray.setContextMenu(contextMenu);
      tray.on("click", () => {
        if (mainWindow?.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow?.show();
        }
      });
    } catch {
      // Best effort tray creation; ignore on systems without tray support
    }
  }

  async function createWindow() {
    const icon = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;
    const serverUrl = await startBackend();

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 850,
      minHeight: 550,
      title: "QuotaLens",
      icon,
      backgroundColor: "#090d16",
      autoHideMenuBar: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    const menu = createApplicationMenu(serverUrl);
    Menu.setApplicationMenu(menu);

    createTray(icon);

    // Open external links in default system browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        shell.openExternal(url);
      }
      return { action: "deny" };
    });

    await mainWindow.loadURL(serverUrl);

    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  }

  // Single instance lock
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on("second-instance", () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });

    app.whenReady().then(async () => {
      // Automatically install CLI integration into PATH on launch
      installCliIntegration({ silent: true }).catch(() => {});
      await createWindow();
    });

    app.on("window-all-closed", async () => {
      if (serverInstance) {
        try {
          await serverInstance.close();
        } catch {
          // Ignore on shutdown
        }
      }
      if (cliContext) {
        try {
          cliContext.dispose();
        } catch {
          // Ignore on shutdown
        }
      }
      if (process.platform !== "darwin") {
        app.quit();
      }
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  }
}
