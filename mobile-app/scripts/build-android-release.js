const fs = require("fs/promises");
const path = require("path");
const { spawnSync } = require("child_process");
const os = require("os");

const projectRoot = path.resolve(__dirname, "..");
const androidDir = path.join(projectRoot, "android");
const localPropertiesFile = path.join(androidDir, "local.properties");
const releaseApk = path.join(
  androidDir,
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk"
);
const cleanupRoots = [
  path.join(projectRoot, "android"),
  path.join(projectRoot, "node_modules"),
];
const nativeBuildTempRoot = path.join(os.tmpdir(), "mobile-app-cxx");

function log(message) {
  console.log(`[android:release] ${message}`);
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function removeDir(target) {
  await fs.rm(target, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 250,
  });
}

function escapeLocalPropertiesPath(target) {
  return target.replace(/\\/g, "\\\\");
}

async function detectAndroidSdkDir() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === "win32"
      ? path.join(os.homedir(), "AppData", "Local", "Android", "Sdk")
      : null,
    process.platform === "win32" ? "C:\\Android\\Sdk" : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function ensureLocalProperties() {
  const existing = (await pathExists(localPropertiesFile))
    ? await fs.readFile(localPropertiesFile, "utf8")
    : "";

  if (existing.includes("sdk.dir=")) {
    return;
  }

  const sdkDir = await detectAndroidSdkDir();
  if (!sdkDir) {
    throw new Error(
      "Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT, or create android/local.properties with sdk.dir."
    );
  }

  const nextContent = `${existing.trim()}\n`.replace(/^\n$/, "") + `sdk.dir=${escapeLocalPropertiesPath(sdkDir)}\n`;
  await fs.writeFile(localPropertiesFile, nextContent, "utf8");
  log(`Using Android SDK at ${sdkDir}`);
}

async function collectBuildDirs(root, results) {
  if (!(await pathExists(root))) {
    return;
  }

  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.name === "build") {
        if (shouldCleanBuildDir(fullPath)) {
          results.push(fullPath);
        }
        continue;
      }

      stack.push(fullPath);
    }
  }
}

function shouldCleanBuildDir(target) {
  const normalized = target.split(path.sep).join("/");
  return (
    normalized.includes("/android/") ||
    normalized.includes("/@react-native/gradle-plugin/") ||
    normalized.includes("/expo-gradle-plugin/") ||
    normalized.includes("/expo-module-gradle-plugin/")
  );
}

function runGradle(args, options = {}) {
  const spawnOptions = {
    cwd: androidDir,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || "production",
    },
    stdio: "inherit",
    ...options,
  };
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", `gradlew.bat ${args.join(" ")}`], spawnOptions)
      : spawnSync("./gradlew", args, spawnOptions);

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

async function main() {
  if (!(await pathExists(androidDir))) {
    throw new Error("Android directory not found. Run `npx expo prebuild` first.");
  }

  log("Stopping any active Gradle daemons");
  runGradle(["--stop"], { stdio: "ignore" });

  log("Cleaning generated Android build outputs");
  const buildDirs = [];
  for (const root of cleanupRoots) {
    await collectBuildDirs(root, buildDirs);
  }

  for (const target of buildDirs.sort((a, b) => b.length - a.length)) {
    await removeDir(target);
  }

  await removeDir(path.join(projectRoot, "android", ".gradle"));
  await removeDir(nativeBuildTempRoot);

  await ensureLocalProperties();

  log("Building release APK");
  const exitCode = runGradle(["assembleRelease", "--no-daemon"]);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }

  if (await pathExists(releaseApk)) {
    log(`Release APK created at ${releaseApk}`);
  } else {
    log("Build finished, but the release APK path was not found.");
  }
}

main().catch((error) => {
  console.error(`[android:release] ${error.message}`);
  process.exit(1);
});
