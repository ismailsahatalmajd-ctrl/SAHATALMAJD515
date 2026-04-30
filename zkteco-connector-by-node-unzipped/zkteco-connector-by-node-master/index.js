const express = require("express");
const bodyParser = require("body-parser");
const ZKLib = require("zklib-js");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

/*
|--------------------------------------------------------------------------
| GLOBAL CRASH PROTECTION (VERY IMPORTANT)
|--------------------------------------------------------------------------
*/
process.on("unhandledRejection", async (reason) => {
  console.log("⚠️ Unhandled Rejection:", reason?.message || reason);
  if (reason?.message?.includes("subarray") || reason?.message?.includes("undefined")) {
    console.log("♻️ No log data or TCP corrupted packet detected, skipping sync");
  }
  isSyncRunning = false;
  await disconnectDevice();
});

process.on("uncaughtException", async (err) => {
  console.log("🔥 Uncaught Exception:", err.message);
  if (err.message?.includes("subarray") || err.message?.includes("undefined")) {
    console.log("♻️ No log data or TCP corrupted packet detected, skipping sync");
  }
  isSyncRunning = false;
  await disconnectDevice();
});

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/
const DEVICE_IP = "192.168.0.192";
const PORT = 4370;

let device;
let isSyncRunning = false;
let skipNextSync = false;

/*
|--------------------------------------------------------------------------
| DEVICE FACTORY
|--------------------------------------------------------------------------
*/
function createDevice() {
  device = new ZKLib(DEVICE_IP, PORT, 10000, 4000);
  console.log("♻️ Device instance created");
}

createDevice();

/*
|--------------------------------------------------------------------------
| UTILS
|--------------------------------------------------------------------------
*/
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
|--------------------------------------------------------------------------
| SAFE CONNECT
|--------------------------------------------------------------------------
*/
async function connectDevice() {
  try {
    await device.createSocket();
    console.log("✅ Device connected " + new Date().toLocaleString());
    return true;
  } catch (err) {
    console.log("❌ Connection failed:", err.message);
    return false;
  }
}

/*
|--------------------------------------------------------------------------
| SAFE DISCONNECT + RESET SOCKET
|--------------------------------------------------------------------------
*/
async function disconnectDevice() {
  try {
    await device.disconnect();
  } catch {}

  // recreate fresh TCP instance
  createDevice();

  console.log("🔌 Device disconnected  " + new Date().toLocaleString());
}

/*
|--------------------------------------------------------------------------
| RETRY WRAPPER
|--------------------------------------------------------------------------
*/
async function withRetry(fn, retry = 3) {
  for (let i = 1; i <= retry; i++) {
    try {
      return await fn();
    } catch (err) {
      console.log(`⚠️ Attempt ${i} failed`);

      if (
        err.message?.includes("subarray") ||
        err.message?.includes("undefined")
      ) {
        console.log("♻️ TCP corrupted packet detected");
      }

      if (i === retry) throw err;

      await sleep(3000);
    }
  }
}

/*
|--------------------------------------------------------------------------
| SYNC ATTENDANCE
|--------------------------------------------------------------------------
*/
async function syncAttendance() {
  if (isSyncRunning) {
    console.log("⏳ Previous sync running...");
    return;
  }

  if (skipNextSync) {
    console.log("⏭️ Skipping cycle after log clear");
    skipNextSync = false;
    return;
  }

  isSyncRunning = true;

  try {
    const connected = await withRetry(connectDevice);

    if (!connected) return;

    /*
        |--------------------------------------------------------------------------
        | GET LOGS
        |--------------------------------------------------------------------------
        */
    const logs = await withRetry(async () => {
      return await device.getAttendances();
    });

    if (!logs || !logs.data || logs.data.length === 0) {
      console.log("ℹ️ No logs found");
      return;
    }

    console.log(`📥 ${logs.data.length} logs fetched`);

    /*
        |--------------------------------------------------------------------------
        | SEND SERVER
        |--------------------------------------------------------------------------
        */
    const res = await withRetry(async () => {
      return await axios.post(
        "http://anondofull.lcl/api/zkteco/logs",
        { logs: logs.data },
        { timeout: 15000 },
      );
    });

    if (!res.data.success) {
      console.log("❌ Server rejected logs");
      return;
    }

    console.log("✅ Logs synced");

    /*
        |--------------------------------------------------------------------------
        | CLEAR DEVICE LOGS
        |--------------------------------------------------------------------------
        */
    await withRetry(async () => {
      await device.clearAttendanceLog();
    });

    console.log("🗑️ Device logs cleared");

    /*
        |--------------------------------------------------------------------------
        | DEVICE COOLDOWN (CRITICAL FIX)
        |--------------------------------------------------------------------------
        */
    console.log("⏳ Device cooldown 10s...");
    await sleep(10000);

    skipNextSync = true;
  } catch (err) {
    console.log("🔥 Sync Failed:", err.message);
  } finally {
    await disconnectDevice();

    isSyncRunning = false;
  }
}

/*
|--------------------------------------------------------------------------
| AUTO SYNC LOOP
|--------------------------------------------------------------------------
*/
setInterval(syncAttendance, 60 * 1000);

console.log("🚀 ZKTeco Sync Service Started");
