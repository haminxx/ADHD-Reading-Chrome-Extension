/**
 * Zips ../extension into public/focus-reader-extension.zip for website download.
 * Run automatically before `npm run build` / `npm run deploy`.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const websiteDir = path.join(__dirname, "..");
const extensionDir = path.join(websiteDir, "..", "extension");
const publicDir = path.join(websiteDir, "public");
const stageRoot = path.join(websiteDir, ".pack-stage");
const stageDir = path.join(stageRoot, "focus-reader");
const outZip = path.join(publicDir, "focus-reader-extension.zip");

if (!existsSync(extensionDir)) {
  console.error("Extension folder not found:", extensionDir);
  process.exit(1);
}

rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });
mkdirSync(stageDir, { recursive: true });

cpSync(extensionDir, stageDir, { recursive: true });

if (existsSync(outZip)) rmSync(outZip);

const isWin = process.platform === "win32";
if (isWin) {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${stageDir}' -DestinationPath '${outZip}' -Force"`,
    { stdio: "inherit" }
  );
} else {
  execSync(`cd "${stageRoot}" && zip -r "${outZip}" focus-reader`, {
    stdio: "inherit",
  });
}

rmSync(stageRoot, { recursive: true, force: true });
console.log("Packed extension ->", outZip);
