import dotenv from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { ClinicStore } from "./store.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const store = new ClinicStore(process.env.MONGODB_URI);

app.use(express.json());
app.use(express.static("public"));

app.get("/api/state", async (_req, res) => {
  res.json(await store.getPublicState());
});

app.post("/api/patients", async (req, res) => {
  try {
    const patient = await store.addPatient(req.body);
    await broadcastState("patient:added", patient.token);
    res.status(201).json(patient);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/call-next", async (_req, res) => {
  try {
    const result = await store.callNext();
    await broadcastState("queue:advanced", result.current?.token ?? null);
    res.json(result);
  } catch (error) {
    res.status(409).json({ message: error.message });
  }
});

app.post("/api/average-time", async (req, res) => {
  try {
    const settings = await store.setAverageConsultationMinutes(req.body.minutes);
    await broadcastState("settings:updated", settings.averageConsultationMinutes);
    res.json(settings);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/reset", async (_req, res) => {
  await store.resetDay();
  await broadcastState("queue:reset", null);
  res.json({ ok: true });
});

io.on("connection", async (socket) => {
  socket.emit("queue:state", await store.getPublicState());
});

async function broadcastState(reason, detail) {
  io.emit("queue:state", {
    ...(await store.getPublicState()),
    lastEvent: { reason, detail, at: new Date().toISOString() }
  });
}

const port = Number(process.env.PORT || 3000);

await store.connect();
server.listen(port, () => {
  console.log(`Clinic queue system running at http://localhost:${port}`);
});
