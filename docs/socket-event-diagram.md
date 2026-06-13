# Socket Event Diagram

```mermaid
sequenceDiagram
    participant R as Receptionist screen
    participant API as Express API
    participant Store as ClinicStore
    participant IO as Socket.IO
    participant P as Patient screen

    R->>API: POST /api/patients
    API->>Store: addPatient(name, phone, concern)
    Store-->>API: token issued
    API->>IO: emit queue:state
    IO-->>R: updated queue
    IO-->>P: updated queue and wait estimates

    R->>API: POST /api/call-next
    API->>Store: complete current, call next
    Store-->>API: current token + metrics
    API->>IO: emit queue:state
    IO-->>R: new current token
    IO-->>P: new current token, tokens ahead, estimated wait

    R->>API: POST /api/average-time
    API->>Store: update setting
    API->>IO: emit queue:state
    IO-->>R: recalculated estimates
    IO-->>P: recalculated estimates
```

## Events

| Event | Direction | Payload |
| --- | --- | --- |
| `queue:state` | Server to all clients | Current token, waiting queue, completed summary, settings, metrics |

The client does not directly mutate queue state over sockets. All writes go through HTTP routes so validation and persistence stay in one place. Socket.IO is used for fan-out after the state changes.
