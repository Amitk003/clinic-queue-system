# Clinic Queue System

Live digital queue manager for a neighbourhood clinic. It replaces paper slips and shouting with a receptionist dashboard and a patient waiting-room screen that update instantly through Socket.IO.

## Demo Sentence

The clinic-owner moment: the receptionist clicks **Call next token** and every patient's phone updates immediately with the new token, tokens ahead, and a wait time based on actual completed consultations.

## Features

- Receptionist can add a patient and issue a token in one focused form.
- Patient screen updates live without refresh.
- Wait time is computed from real completed consultation durations once available, with the receptionist's average as the startup fallback.
- Previous consultation is completed automatically when the next token is called.
- MongoDB persistence when `MONGODB_URI` is configured, local JSON fallback for instant demos.
- Reset day button for hackathon demo loops.

## Tech Stack

- Express.js backend
- Socket.IO live sync
- MongoDB through Mongoose, with JSON fallback
- Plain HTML/CSS/JS frontend for fast loading and easy deployment

## Run Locally

```bash
npm install
npm start
```

On Windows PowerShell, use `npm.cmd install` and `npm.cmd start` if script execution is blocked.

Open:

- Receptionist: `http://localhost:3000/reception.html`
- Patient waiting room: `http://localhost:3000/waiting-room.html`

Optional MongoDB:

```bash
copy .env.example .env
# set MONGODB_URI in .env
npm start
```

## How Wait Time Works

For each waiting token:

```text
estimated wait = tokens ahead * average consultation minutes
               + one consultation if a patient is currently inside
```

The average consultation time comes from:

1. Recent completed consultations, after at least two consultations have been completed.
2. Receptionist-controlled average consultation time before enough real data exists.

This keeps the estimate useful at opening time, then makes it increasingly data-driven as the clinic runs.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/state` | Read current queue state |
| `POST` | `/api/patients` | Add patient and issue token |
| `POST` | `/api/call-next` | Complete current patient and call next token |
| `POST` | `/api/average-time` | Update receptionist's average consultation time |
| `POST` | `/api/reset` | Clear the day for demo/testing |

## 📁 Submission & Evaluation Documents

For hackathon reviewers, the complete entry includes the following core documents inside this repository:

1. **[README.md](README.md)** (This document) - Installation instructions, functional explanation, and API specifications.
2. **[docs/socket-event-diagram.md](docs/socket-event-diagram.md)** - Sequence diagram mapping out live WebSocket updates and Socket.IO connection flows between endpoints.
3. **[docs/thought-process.md](docs/thought-process.md)** - **(Important for Criteria 4 Evaluation)**. Details product goals, edge cases handled, concurrency safety approaches, and a production horizontal scaling roadmap (Redis Pub/Sub, CDN separation, and atomic locks).

