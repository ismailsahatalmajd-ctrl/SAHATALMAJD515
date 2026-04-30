import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import qs from "qs";

// const express = require("express");
// const fetch = require("node-fetch");
// const dotenv = require("dotenv");
// const qs = require("qs");

// Load environment variables
import path from "path";
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 9000;
const API_URL = process.env.API_URL || "http://localhost:3000/api/attendance";

// Middleware to parse text/plain and form data
app.use(express.text({ type: "*/*" }));
app.use(express.urlencoded({ extended: true }));

// Configuration from environment variables
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT) || 30000;
const DEVICE_TIMEOUT = parseInt(process.env.DEVICE_TIMEOUT) || 30000;
const MAX_LOG_COUNT = parseInt(process.env.MAX_LOG_COUNT) || 10000;
const MAX_USER_COUNT = parseInt(process.env.MAX_USER_COUNT) || 1000;
const SERVER_NAME = process.env.SERVER_NAME || "ZKTeco-Bridge";
const SERVER_VERSION = process.env.SERVER_VERSION || "1.0.0";

// ADMS Protocol Helper Functions
const getCurrentTime = () => {
  const now = new Date();
  return now.toISOString().replace("T", " ").replace("Z", "");
};

const formatDeviceResponse = (data) => {
  return `OK\n${data}`;
};

const getData = (data) => {
  const normalized = data
    .trim()
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, "&");

  const parsed = qs.parse(normalized);
  return parsed;
};

// GETOPTIONS - Device requests server configuration
app.get("/iclock/getoptions", (req, res) => {
  console.log("=== GETOPTIONS Request ===");
  console.log("Device requesting server options");
  console.log("Query params:", req.query);

  const options = [
    "ATTLOGStamp=1",
    "OPERLOGStamp=1",
    "ATTPHOTOStamp=1",
    "FPStamp=1",
    "FACEStamp=1",
    "PALMStamp=1",
    "VEINStamp=1",
    "RETINAStamp=1",
    "VOICESTamp=1",
    "PWDStamp=1",
    "FINGERStamp=1",
    "PASSCodeStamp=1",
    "IDStamp=1",
    "GPSStamp=1",
    "WIFIStamp=1",
    "SMSStamp=1",
    "PHONECallStamp=1",
    "INTERNETStamp=1",
    "ZEM800Stamp=1",
    "ZEM300Stamp=1",
    "ZEM200Stamp=1",
    "ZEM100Stamp=1",
    "ZEM80Stamp=1",
    "ZEM60Stamp=1",
    "ZEM50Stamp=1",
    "ZEM30Stamp=1",
    "ZEM20Stamp=1",
    "ZEM10Stamp=1",
    "ErrorDelay=30",
    "Delay=10",
    "TransTimes=00:00;23:59",
    "TransInterval=1",
    "TransFlag=1111111111",
    "TimeZone=6",
    "Realtime=1",
    "Encrypt=None",
  ].join("\n");

  res.send(formatDeviceResponse(options));
});

app.get("/iclock/gettime", (req, res) => {
  console.log("=== GETTIME Request ===");
  console.log("Device requesting server time");

  const serverTime = getCurrentTime();
  res.send(formatDeviceResponse(serverTime));
});

app.post("/iclock/setoptions", (req, res) => {
  console.log("=== SETOPTIONS Request ===");
  console.log("Device sending configuration:", req.body);
  res.send("OK");
});

app.post("/iclock/device", (req, res) => {
  console.log("=== DEVICE Registration ===");
  console.log("Device registration data:", req.body);

  const serverTime = getCurrentTime();
  res.send(formatDeviceResponse(serverTime));
});

app.get("/iclock/ping", (req, res) => {
  console.log("=== PING Request ===");
  console.log("Device ping from:", req.ip);
  res.send("OK");
});

app.get("/iclock/getrequest", (req, res) => {
  console.log("=== GETREQUEST Request ===");
  console.log("Device requesting server commands");
  console.log("Query params:", req.query);
  res.send("OK");
});

app.post("/iclock/cdata", async (req, res) => {
  try {
    const searchParams = qs.stringify(req.query);
    const deviceSn = req.query.SN;
    const dataType = req.query.c;
    const table = req.query.table;
    const stamp = req.query.Stamp;
    
    console.log(`=== CDATA Received from SN: ${deviceSn} ===`);
    console.log(`Table: ${table}, Body: ${req.body.substring(0, 100)}...`);

    const response = await fetch(`${API_URL}?${searchParams}`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "User-Agent":
          req.get("User-Agent") || `${SERVER_NAME}/${SERVER_VERSION}`,
        "X-Device-SN": deviceSn,
        "X-Data-Type": dataType,
        "X-Table": table,
        "X-Stamp": stamp,
      },
      body: req.body,
      timeout: API_TIMEOUT,
    });


    if (!response.ok) {
      console.error(`[ADMS] Forwarding failed with status: ${response.status}`);
      return res.status(500).send("FAIL");
    }

    console.log(`[ADMS] Successfully forwarded to API`);
    return res.status(200).send("OK");
  } catch (error) {
    console.error("[ADMS] Error forwarding data:", error);
    if (!res.headersSent) {
      return res.status(500).send("ERROR");
    }
  }
});

app.get("/iclock/info", (req, res) => {
  console.log("=== DEVICE INFO Request ===");
  console.log("Device requesting server info");

  const serverInfo = [
    `ServerName=${SERVER_NAME}`,
    `ServerVersion=${SERVER_VERSION}`,
    "ServerTime=" + getCurrentTime(),
    `MaxLogCount=${MAX_LOG_COUNT}`,
    `MaxUserCount=${MAX_USER_COUNT}`,
  ].join("\n");

  res.send(formatDeviceResponse(serverInfo));
});

app.get("/iclock/status", (req, res) => {
  console.log("=== DEVICE STATUS Request ===");
  console.log("Device checking server status");
  res.send("OK");
});

app.post("/iclock/command", (req, res) => {
  console.log("=== DEVICE COMMAND ===");
  console.log("Device command received:", req.body);
  res.send("OK");
});

app.get("/iclock/getuser", (req, res) => {
  console.log("=== GETUSER Request ===");
  console.log("Device requesting user data");
  console.log("Query params:", req.query);
  res.send("OK");
});

app.post("/iclock/setuser", express.text({ type: "*/*" }), (req, res) => {
  console.log("=== SETUSER Request ===");
  console.log("Device sending user data:", req.body);
  res.send("OK");
});

app.get("/iclock/getphoto", (req, res) => {
  console.log("=== GETPHOTO Request ===");
  console.log("Device requesting photo data");
  console.log("Query params:", req.query);
  res.send("OK");
});

app.post("/iclock/setphoto", express.text({ type: "*/*" }), (req, res) => {
  console.log("=== SETPHOTO Request ===");
  console.log("Device sending photo data");
  res.send("OK");
});

app.get("/iclock/getfp", (req, res) => {
  console.log("=== GETFP Request ===");
  console.log("Device requesting fingerprint data");
  console.log("Query params:", req.query);
  res.send("OK");
});

app.post("/iclock/setfp", express.text({ type: "*/*" }), (req, res) => {
  console.log("=== SETFP Request ===");
  console.log("Device sending fingerprint data");
  res.send("OK");
});

app.get("/iclock/getface", (req, res) => {
  console.log("=== GETFACE Request ===");
  console.log("Device requesting face data");
  console.log("Query params:", req.query);
  res.send("OK");
});

app.post("/iclock/setface", express.text({ type: "*/*" }), (req, res) => {
  console.log("=== SETFACE Request ===");
  console.log("Device sending face data");
  res.send("OK");
});

app.get("/", (req, res) => {
  res.json({
    message: "ZKTeco ADMS Bridge Server",
    service: SERVER_NAME,
    version: SERVER_VERSION,
    status: "running",
    timestamp: new Date().toISOString(),
    endpoints: [
      "GET /health - Health check",
      "GET /iclock/getoptions - Device configuration",
      "GET /iclock/gettime - Server time sync",
      "POST /iclock/setoptions - Device settings",
      "POST /iclock/device - Device registration",
      "GET /iclock/ping - Device heartbeat",
      "POST /iclock/cdata - Attendance data",
      "GET /iclock/info - Server information",
      "GET /iclock/status - Server status",
      "POST /iclock/command - Device commands",
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: SERVER_NAME,
    version: SERVER_VERSION,
    endpoints: [
      "GET /iclock/getoptions - Device configuration",
      "GET /iclock/gettime - Server time sync",
      "POST /iclock/setoptions - Device settings",
      "POST /iclock/device - Device registration",
      "GET /iclock/ping - Device heartbeat",
      "POST /iclock/cdata - Attendance data",
      "GET /iclock/info - Server information",
      "GET /iclock/status - Server status",
      "POST /iclock/command - Device commands",
    ],
  });
});

app.listen(PORT, () => {
  console.log(`🚀 ${SERVER_NAME} v${SERVER_VERSION} running on port ${PORT}`);
  console.log(`📡 ADMS Protocol Endpoints:`);
  console.log(`   GET  /iclock/getoptions - Device configuration`);
  console.log(`   GET  /iclock/gettime    - Server time sync`);
  console.log(`   POST /iclock/setoptions - Device settings`);
  console.log(`   POST /iclock/device     - Device registration`);
  console.log(`   GET  /iclock/ping       - Device heartbeat`);
  console.log(`   POST /iclock/cdata      - Attendance data`);
  console.log(`   GET  /iclock/info       - Server information`);
  console.log(`   GET  /iclock/status     - Server status`);
  console.log(`   POST /iclock/command    - Device commands`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Vercel API: ${API_URL}`);
  console.log(`⚙️ Configuration loaded from .env file`);
});

process.on("SIGTERM", () => {
  console.log("🛑 Shutting down ZKTeco Bridge server...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Shutting down ZKTeco Bridge server...");
  process.exit(0);
});
