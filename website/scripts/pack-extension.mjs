/**
 * Zips the Chrome extension for website download.
 *
 * The zip root must contain manifest.json directly (no extra wrapper folder),
 * so after "Extract All" the user can Load unpacked on that folder in Chrome.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const websiteDir = path.join(__dirname, "..");
const extensionDir = path.join(websiteDir, "..", "extension");
const publicDir = path.join(websiteDir, "public");
const stageDir = path.join(websiteDir, ".pack-stage");
const outZip = path.join(publicDir, "focus-reader-extension.zip");

// Only ship files Chrome needs to run the extension.
const SKIP = new Set(["make_icons.py", ".DS_Store", "Thumbs.db"]);

if (!existsSync(extensionDir)) {
  console.error("Extension folder not found:", extensionDir);
  process.exit(1);
}

function copyExtensionFlat(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (SKIP.has(name)) continue;
    const from = path.join(src, name);
    const to = path.join(dest, name);
    cpSync(from, to, { recursive: true });
  }
}

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });
copyExtensionFlat(extensionDir, stageDir);

const manifestPath = path.join(stageDir, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("manifest.json missing from staged extension");
  process.exit(1);
}

if (existsSync(outZip)) rmSync(outZip);

const isWin = process.platform === "win32";
if (isWin) {
  // Compress contents at zip root — NOT the parent folder name.
  const glob = path.join(stageDir, "*").replace(/'/g, "''");
  const dest = outZip.replace(/'/g, "''");
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${glob}' -DestinationPath '${dest}' -Force"`,
    { stdio: "inherit" }
  );
} else {
  execSync(`cd "${stageDir}" && zip -r "${outZip}" .`, { stdio: "inherit" });
}

// Verify manifest.json is at the zip root.
if (isWin) {
  const check = execSync(
    `powershell -NoProfile -Command "(Add-Type -AssemblyName System.IO.Compression.FileSystem); [IO.Compression.ZipFile]::OpenRead('${outZip.replace(/'/g, "''")}').Entries | Where-Object { $_.FullName -eq 'manifest.json' } | Select-Object -ExpandProperty FullName"`,
    { encoding: "utf8" }
  ).trim();
  if (check !== "manifest.json") {
    console.error("Zip verification failed: manifest.json not at root. Got:", check);
    process.exit(1);
  }
}

rmSync(stageDir, { recursive: true, force: true });
const sizeMb = (statSync(outZip).size / (1024 * 1024)).toFixed(2);
console.log(`Packed extension -> ${outZip} (${sizeMb} MB, manifest.json at zip root)`);
