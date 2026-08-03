const { app, BrowserWindow } = require("electron");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 512,
    height: 512,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { sandbox: true },
  });
  await window.loadFile(join(__dirname, "..", "build", "icon.svg"));
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  if (image.isEmpty()) throw new Error("Failed to render icon");
  writeFileSync(join(__dirname, "..", "build", "icon.png"), image.toPNG());
}).then(
  () => app.quit(),
  (error) => {
    console.error(error);
    app.exit(1);
  },
);
