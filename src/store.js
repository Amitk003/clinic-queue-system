import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";

const DATA_FILE = path.join(process.cwd(), "data", "clinic-state.json");
const DEFAULT_STATE = {
  clinicName: "Neighbourhood Clinic",
  nextToken: 1,
  current: null,
  queue: [],
  completed: [],
  settings: {
    averageConsultationMinutes: 7
  },
  updatedAt: null
};

const patientSchema = new mongoose.Schema(
  {
    token: Number,
    name: String,
    phone: String,
    concern: String,
    status: String,
    addedAt: Date,
    calledAt: Date,
    completedAt: Date,
    durationMinutes: Number
  },
  { _id: false }
);

const stateSchema = new mongoose.Schema({
  singleton: { type: String, default: "clinic", unique: true },
  clinicName: String,
  nextToken: Number,
  current: patientSchema,
  queue: [patientSchema],
  completed: [patientSchema],
  settings: {
    averageConsultationMinutes: Number
  },
  updatedAt: Date
});

export class ClinicStore {
  constructor(mongoUri) {
    this.mongoUri = mongoUri;
    this.StateModel = null;
    this.memory = structuredClone(DEFAULT_STATE);
  }

  async connect() {
    if (!this.mongoUri) {
      this.memory = await this.readFileState();
      return;
    }

    try {
      await mongoose.connect(this.mongoUri, { serverSelectionTimeoutMS: 1500 });
      this.StateModel = mongoose.model("ClinicState", stateSchema);
      await this.StateModel.findOneAndUpdate(
        { singleton: "clinic" },
        { $setOnInsert: { ...structuredClone(DEFAULT_STATE), singleton: "clinic" } },
        { upsert: true, new: true }
      );
      console.log("Persistence: MongoDB");
    } catch (error) {
      console.warn(`MongoDB unavailable, using local JSON fallback: ${error.message}`);
      this.memory = await this.readFileState();
    }
  }

  async addPatient(input) {
    const name = cleanText(input?.name);
    if (!name) {
      throw new Error("Patient name is required.");
    }

    return this.update((state) => {
      const patient = {
        token: state.nextToken,
        name,
        phone: cleanText(input?.phone),
        concern: cleanText(input?.concern),
        status: "waiting",
        addedAt: new Date().toISOString(),
        calledAt: null,
        completedAt: null,
        durationMinutes: null
      };
      state.nextToken += 1;
      state.queue.push(patient);
      return patient;
    });
  }

  async callNext() {
    return this.update((state) => {
      const now = new Date();
      if (state.current) {
        const calledAt = new Date(state.current.calledAt);
        const durationMinutes = Math.max(1, Math.round((now - calledAt) / 60000));
        state.completed.unshift({
          ...state.current,
          status: "completed",
          completedAt: now.toISOString(),
          durationMinutes
        });
        state.completed = state.completed.slice(0, 30);
      }

      const next = state.queue.shift();
      if (!next) {
        state.current = null;
        return { current: null, completedPrevious: true };
      }

      state.current = {
        ...next,
        status: "in-consultation",
        calledAt: now.toISOString()
      };
      return { current: state.current, completedPrevious: Boolean(state.completed[0]) };
    });
  }

  async setAverageConsultationMinutes(minutes) {
    const parsed = Number(minutes);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 60) {
      throw new Error("Average consultation time must be between 1 and 60 minutes.");
    }

    return this.update((state) => {
      state.settings.averageConsultationMinutes = Math.round(parsed);
      return state.settings;
    });
  }

  async resetDay() {
    await this.saveState(structuredClone(DEFAULT_STATE));
  }

  async getPublicState() {
    const state = await this.loadState();
    const average = this.getRealAverageMinutes(state);
    const queue = state.queue.map((patient, index) => ({
      ...patient,
      tokensAhead: index,
      estimatedWaitMinutes: index * average + (state.current ? average : 0)
    }));

    return {
      clinicName: state.clinicName,
      current: state.current,
      queue,
      completed: state.completed.slice(0, 8),
      settings: state.settings,
      metrics: {
        queueLength: state.queue.length,
        averageConsultationMinutes: average,
        completedToday: state.completed.length,
        source: state.completed.length >= 2 ? "completed consultations" : "receptionist setting"
      },
      updatedAt: state.updatedAt
    };
  }

  getRealAverageMinutes(state) {
    const durations = state.completed
      .map((patient) => Number(patient.durationMinutes))
      .filter((minutes) => Number.isFinite(minutes) && minutes > 0);
    if (durations.length >= 2) {
      const recent = durations.slice(0, 10);
      return Math.max(1, Math.round(recent.reduce((sum, value) => sum + value, 0) / recent.length));
    }
    return Number(state.settings.averageConsultationMinutes);
  }

  async update(mutator) {
    const state = await this.loadState();
    const result = mutator(state);
    state.updatedAt = new Date().toISOString();
    await this.saveState(state);
    return result;
  }

  async loadState() {
    if (this.StateModel) {
      const doc = await this.StateModel.findOne({ singleton: "clinic" }).lean();
      return normalizeState(doc ?? DEFAULT_STATE);
    }
    return structuredClone(this.memory);
  }

  async saveState(state) {
    const normalized = normalizeState(state);
    if (this.StateModel) {
      await this.StateModel.findOneAndUpdate(
        { singleton: "clinic" },
        { ...normalized, singleton: "clinic" },
        { upsert: true }
      );
      return;
    }
    this.memory = normalized;
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(normalized, null, 2));
  }

  async readFileState() {
    try {
      const raw = await fs.readFile(DATA_FILE, "utf8");
      return normalizeState(JSON.parse(raw));
    } catch {
      await this.saveState(structuredClone(DEFAULT_STATE));
      return structuredClone(DEFAULT_STATE);
    }
  }
}

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeState(state) {
  return {
    ...structuredClone(DEFAULT_STATE),
    ...state,
    settings: {
      ...DEFAULT_STATE.settings,
      ...(state?.settings ?? {})
    },
    queue: state?.queue ?? [],
    completed: state?.completed ?? []
  };
}
