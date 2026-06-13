# Thought Process

## Product Goal

Most small clinics do not need a hospital-grade system. They need one screen that the receptionist can trust during rush hour and one waiting-room view that stops patients from asking, "mera number kab aayega?"

The build optimizes for:

- A receptionist issuing tokens quickly.
- Patients seeing live status without app installation.
- A clinic owner understanding the value in one demo click.

## Key Decisions

- **Single source of truth:** All mutations happen on the server through Express routes.
- **Live fan-out:** After every mutation, the server emits `queue:state` to every connected browser.
- **No hardcoded wait:** The receptionist can set an opening average, but completed consultations become the real estimate source.
- **MongoDB-ready:** Mongoose is included for evaluation-friendly persistence, but the app falls back to a JSON file so demos do not fail when MongoDB is unavailable.

## Concurrency

The risky moment is `call next`, because two receptionists could click at the same time. The current prototype centralizes queue mutation in `ClinicStore.callNext()`. For a production MongoDB deployment, the next step would be moving that operation to an atomic transaction or a `findOneAndUpdate` pipeline so only one request can claim the next token.

For hackathon scope, this is acceptable because the problem statement asks for one receptionist screen. The architecture leaves a clear upgrade path.

## Edge Cases Covered

- Empty queue: calling next clears the current consultation and reports no active patient.
- First appointment of the day: wait time uses receptionist setting until real data exists.
- No MongoDB during demo: local JSON persistence keeps the prototype working.
- Refreshing either screen: new clients immediately receive the latest `queue:state`.
- Patient enters old or invalid token: waiting-room view explains that the token is not currently waiting.
- End-of-day demo reset: receptionist can clear the state quickly.

## What I Would Add Next

- OTP-free public patient link like `/token/12`.
- Doctor screen to mark consultation done without waiting for the next call.
- Atomic MongoDB queue advancement for multiple reception desks.
- SMS or WhatsApp notification when a patient has two tokens ahead.

---

## 🚀 Production Scaling Roadmap

If this project were deployed to serve a multi-branch clinic chain with thousands of daily active users, we would scale the system as follows:

1. **Frontend-Backend Decoupling**:
   - Move the static assets inside `public` to a global CDN (e.g., Cloudflare Pages or Vercel).
   - Host the Express API on a containerized environment (e.g., AWS ECS or GCP Cloud Run) pointing socket clients to `api.clinicflow.com`. This reduces load on the main application threads.

2. **Horizontal Backend Scaling (Socket.IO Adapter)**:
   - Sockets connections are in-memory. If we spin up multiple containers behind an ALB load balancer, we would introduce the `@socket.io/redis-adapter`.
   - Redis acts as a pub/sub coordinator, ensuring that a state change on Server A is instantly broadcasted to clients connected on Server B and Server C.

3. **Concurrency-Safe Queue Advancement**:
   - Rewrite the `callNext` database transaction into a strict atomic operation using MongoDB `findOneAndUpdate` utilizing operations like `$pull` or a distributed lock (e.g., Redlock via Redis) to guarantee a token is only called once if multiple receptionists click the button simultaneously.

