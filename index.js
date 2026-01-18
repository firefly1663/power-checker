import axios from "axios";
import crypto from "crypto";
import "dotenv/config";


/* ========= CONFIG ========= */
const CLIENT_ID = process.env.CLIENT_ID
const CLIENT_SECRET = process.env.CLIENT_SECRET
const DEVICE_ID = process.env.DEVICE_ID  
const BOT_TOKEN = process.env.BOT_TOKEN
const CHAT_ID = process.env.CHAT_ID

const POLL_INTERVAL = 30_000; // 60 секунд
/* ========================== */

const BASE_URL = `https://openapi.tuyaeu.com`;

let accessToken = null;
let lastState = null;

/* ===== TUYA AUTH ===== */
async function getAccessToken() {
  const method = "GET";
  const timestamp = Date.now().toString();
  const path = "/v1.0/token?grant_type=1";

  const contentHash = crypto
    .createHash("sha256")
    .update("")
    .digest("hex");

  const stringToSign = [
    method,
    contentHash,
    "",
    path,
  ].join("\n");

  const signStr = CLIENT_ID + timestamp + stringToSign;

  const sign = crypto
    .createHmac("sha256", CLIENT_SECRET)
    .update(signStr)
    .digest("hex")
    .toUpperCase();

  const res = await axios.get(`${BASE_URL}${path}`, {
    headers: {
      client_id: CLIENT_ID,
      t: timestamp,
      sign_method: "HMAC-SHA256",
      sign,
    },
  });

  if (!res.data.success) {
    console.error("❌ getAccessToken failed", res.data);
    throw new Error(res.data.msg);
  }

  accessToken = res.data.result.access_token;
}


function signRequest(payload) {
  return crypto
    .createHmac("sha256", CLIENT_SECRET)
    .update(payload)
    .digest("hex")
    .toUpperCase();
}

function signWithToken(method, path, body = "") {
  const t = Date.now().toString();
  const payload =
    CLIENT_ID +
    accessToken +
    t +
    method.toUpperCase() +
    "\n" +
    crypto.createHash("sha256").update(body).digest("hex") +
    "\n\n" +
    path;

  return {
    t,
    sign: signRequest(payload),
  };
}

/* ===== TUYA DEVICE STATUS ===== */
async function getDeviceOnlineStatus() {
  const path = `/v1.0/devices/${DEVICE_ID}`;
  const { t, sign } = signWithToken("GET", path);

  const res = await axios.get(`${BASE_URL}${path}`, {
    headers: {
      "client_id": CLIENT_ID,
      "access_token": accessToken,
      "t": t,
      "sign": sign,
      "sign_method": "HMAC-SHA256",
    },
  });

  return res.data.result.online;
}

/* ===== TELEGRAM ===== */
async function sendTG(text) {
  await axios.post(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      chat_id: CHAT_ID,
      text,
    }
  );
  console.log('Sended')
}

/* ===== MAIN LOOP ===== */
async function checkPower() {
  try {
    if (!accessToken) {
      await getAccessToken();
    }

    const online = await getDeviceOnlineStatus();
    
    if (lastState === null) {
      lastState = online;
      return;
    }

    if (online !== lastState) {
      lastState = online;

      await sendTG(
        online
          ? "✅ Світло вдома зʼявилось"
          : "❌ Світло вдома пропало"
      );
    }
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    accessToken = null;
  }
}

setInterval(checkPower, POLL_INTERVAL);
console.log("🔌 Tuya power monitor started");
