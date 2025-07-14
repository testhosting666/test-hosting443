// // FILE: server.js (versi lengkap dengan Web Push Notification + fetch notifikasi dari database)

const express = require("express");
const cors = require("cors");
const path = require("path");
const bodyParser = require("body-parser");
const { readInputs, readOutput, writeCoil } = require("./modbus");

const { logLogin, getLoginHistory } = require("./models/userModel");
const { logEvent } = require("./models/eventModel");
const { logZoneEvent } = require("./models/zoneModel");
const { webpush } = require("./webpush");
const db = require("./db");

const app = express();
const PORT = 666;

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static("public"));

let previousInputState = new Array(4).fill(false);
let previousOutputState = new Array(16).fill(false);
let subscriptions = [];

// === MONITOR INPUT (hanya log, tidak kirim notifikasi) ===
async function monitorInputChanges() {
  try {
    const currentState = await readInputs();
    if (!Array.isArray(currentState) || currentState.length !== 16) return;

    for (let i = 0; i < 4; i++) {
      const now = currentState[i];
      const before = previousInputState[i];
      const zone = i + 1;

      if (now !== before) {
        const status = now ? "off" : "on"; // false berarti aktif

        try {
          await logZoneEvent(zone, "fire_detected", status);
          console.log(
            `📥 Zona ${zone} fire_detected berubah ke ${status} → dicatat`
          );
        } catch (err) {
          console.warn(
            `⚠️ Gagal mencatat log input zona ${zone}:`,
            err.message
          );
        }
      }
    }

    previousInputState = currentState.slice(0, 4);
  } catch (err) {
    console.error("❌ Gagal membaca input:", err.message);
  }
}

// === MONITOR OUTPUT (log + kirim notifikasi jika alarm aktif) ===
async function monitorOutputChanges() {
  try {
    const currentState = await readOutput();
    if (!Array.isArray(currentState) || currentState.length !== 16) return;

    const monitoredZones = [
      { zone: 1, index: 0 },
      { zone: 2, index: 4 },
      { zone: 3, index: 8 },
      { zone: 4, index: 12 },
    ];

    for (const { zone, index } of monitoredZones) {
      const now = currentState[index];
      const before = previousOutputState[index];

      if (now !== before) {
        const status = now ? "on" : "off";

        try {
          await logZoneEvent(zone, "alarm", status);
          console.log(`📥 Zona ${zone} alarm berubah ke ${status} → dicatat`);

          if (status === "on") {
            const payload = JSON.stringify({
              title: "🔥 PERINGATAN KEBAKARAN",
              body: `Alarm aktif di Zona ${zone}`,
              icon: "/assets/icons/alarm-icon.png",
              zone,
              event_type: "alarm",
            });

            for (const sub of subscriptions) {
              await webpush.sendNotification(sub, payload);
            }
          }
        } catch (err) {
          console.warn(
            `⚠️ Gagal mencatat log output zona ${zone}:`,
            err.message
          );
        }
      }
    }

    previousOutputState = [...currentState];
  } catch (err) {
    console.error("❌ Gagal membaca output:", err.message);
  }
}

setInterval(() => {
  monitorInputChanges();
  monitorOutputChanges();
}, 1000);

// === API: INPUT ===
app.get("/api/input", async (req, res) => {
  try {
    const data = await readInputs();
    if (Array.isArray(data) && data.length === 16) {
      return res.json({ success: true, input: data });
    } else {
      return res
        .status(500)
        .json({ success: false, message: "Data input tidak valid" });
    }
  } catch (err) {
    console.error("❌ Error /api/input:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Gagal membaca input" });
  }
});

// === API: OUTPUT ===
app.get("/api/output", async (req, res) => {
  try {
    const data = await readOutput();
    if (Array.isArray(data) && data.length === 16) {
      return res.json({ success: true, output: data });
    } else {
      return res
        .status(500)
        .json({ success: false, message: "Data output tidak valid" });
    }
  } catch (err) {
    console.error("❌ Error /api/output:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Gagal membaca coils output" });
  }
});

// === API: BUTTON CONTROL ===
app.post("/api/button", async (req, res) => {
  const { index, state } = req.body;

  if (
    typeof index !== "number" ||
    index < 0 ||
    index >= 16 ||
    typeof state !== "boolean"
  ) {
    return res.status(400).json({
      success: false,
      message: "Request tidak valid: index harus 0–15 dan state harus boolean",
    });
  }

  try {
    const success = await writeCoil(index, state);
    const zone = Math.floor(index / 4) + 1;
    let eventType = "";

    if (index % 4 === 1) eventType = "sounding";
    else if (index % 4 === 0) eventType = "mute";
    else if (index % 4 === 2) eventType = "reset";

    const status = state ? "on" : "off";

    if (eventType) {
      try {
        await logZoneEvent(zone, eventType, status);
        console.log(
          `🔘 Tombol '${eventType}' zona ${zone} → ${status} → dicatat`
        );
      } catch (err) {
        console.warn("⚠️ Gagal log event tombol ke database:", err.message);
      }
    }

    return res.json({ success });
  } catch (err) {
    console.error("❌ Error /api/button:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Gagal menulis coil" });
  }
});

// === API: LOGIN ===
app.post("/api/login", async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== "string") {
    return res
      .status(400)
      .json({ success: false, message: "Username tidak valid" });
  }

  try {
    await logLogin(username);
    console.log(`✅ Login dicatat untuk user: ${username}`);
    return res.json({ success: true });
  } catch (err) {
    console.error("❌ Error saat log login:", err.message);
    return res.status(500).json({ success: false, message: "Gagal log login" });
  }
});

// === API: LOGIN HISTORY ===
app.get("/api/login-history", async (req, res) => {
  try {
    const history = await getLoginHistory();
    return res.json({ success: true, data: history });
  } catch (err) {
    console.error("❌ Gagal mengambil login history:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Gagal mengambil data login" });
  }
});

// === API: SUBSCRIBE PUSH ===
app.post("/subscribe", (req, res) => {
  const sub = req.body;
  console.log("📱 Subscription diterima dari client:");
  console.log(JSON.stringify(sub, null, 2));

  subscriptions.push(sub);
  res.status(201).json({ message: "Subscribed" });
});

// === API: KIRIM PUSH MANUAL ===
app.post("/send-alarm", async (req, res) => {
  const payload = JSON.stringify({
    title: "🚨 ALARM",
    body: "Kebakaran terdeteksi di Zona 1!",
    icon: "/assets/icons/alarm-icon.png",
    zone: 1,
  });

  try {
    for (const sub of subscriptions) {
      await webpush.sendNotification(sub, payload);
    }
    res.json({ message: "Notifikasi dikirim" });
  } catch (error) {
    console.error("❌ Gagal kirim notifikasi:", error);
    res.sendStatus(500);
  }
});

// === REDIRECT ROOT KE LOGIN ===
app.get("/", (req, res) => {
  res.redirect("/login.html");
});

// === API: HISTORI NOTIFIKASI (hanya status ON) ===
app.get("/api/notifications", async (req, res) => {
  const { zone, event_type } = req.query;

  let sql = `
    SELECT zone, event_type, status, timestamp
    FROM zone_event_log
    WHERE status = 'on'
  `;
  const params = [];

  if (zone) {
    sql += " AND zone = ?";
    params.push(zone);
  }
  if (event_type) {
    sql += " AND event_type = ?";
    params.push(event_type);
  }

  sql += " ORDER BY timestamp DESC LIMIT 50";

  try {
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error("❌ Gagal ambil histori notifikasi:", error.message);
    res.status(500).json({ message: "Gagal mengambil histori notifikasi" });
  }
});

app.listen(PORT, () => {
  console.log(`🔥 Server berjalan di http://localhost:${PORT}`);
});
