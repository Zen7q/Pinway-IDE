import express from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const run = promisify(execFile);

/* 1. НАЛАШТУВАННЯ */
const PORT = 3000;
const HOST = "127.0.0.1";
const MAX_CODE_BYTES = 200 * 1024;
const COMPILE_TIMEOUT_MS = 120_000;
const FQBN_PATTERN = /^[\w-]+:[\w-]+:[\w-]+(:[\w=,.-]+)?$/;

const app = express();
app.use(express.json({ limit: "300kb" }));

/* 2. ПЕРЕВІРКА, ЩО СЕРВЕР ЖИВИЙ */
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

/* 3. КОМПІЛЯЦІЯ */
app.post("/api/compile", async (req, res) => {
  const { fqbn, code } = req.body ?? {};

  if (typeof fqbn !== "string" || !FQBN_PATTERN.test(fqbn)) {
    return res.status(400).json({ ok: false, error: "Invalid board (fqbn)." });
  }
  if (typeof code !== "string" || code.trim() === "") {
    return res.status(400).json({ ok: false, error: "Code is empty." });
  }
  if (Buffer.byteLength(code) > MAX_CODE_BYTES) {
    return res.status(413).json({ ok: false, error: "Code is too large." });
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "pinway-"));
  const sketchDir = path.join(workDir, "sketch");
  const outDir = path.join(workDir, "out");

  try {
    await mkdir(sketchDir);
    await writeFile(path.join(sketchDir, "sketch.ino"), code);

    const { stdout, stderr } = await run(
      "arduino-cli",
      ["compile", "--fqbn", fqbn, "--output-dir", outDir, sketchDir],
      { timeout: COMPILE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }
    );

    res.json({ ok: true, log: stdout + stderr });
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.json({ ok: false, log: "arduino-cli was not found on the server." });
    }
    if (error.killed) {
      return res.json({ ok: false, log: "Compilation timed out." });
    }
    const log = (error.stdout ?? "") + (error.stderr ?? "");
    res.json({ ok: false, log: log || error.message });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

/* 4. ПОМИЛКИ ЗАПИТІВ (наприклад, завеликий JSON) */
app.use((error, req, res, next) => {
  res.status(error.status ?? 500).json({ ok: false, error: error.message });
});

/* 5. ЗАПУСК */
app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});