# Iris User App — Developer Documentation
**Project Iris · Internal Developer Specification · Confidential**
Version: v0.1 · April 2026 · Status: Pre-Development

---

## Table of Contents
1. [Overview](#overview)
2. [Critical Role: The Local Bridge](#critical-role-the-local-bridge)
3. [Tech Stack](#tech-stack)
4. [Architecture Overview](#architecture-overview)
5. [Pi Local HTTP API](#pi-local-http-api)
6. [App–Pi Communication](#apppi-communication)
7. [Feature Modules](#feature-modules)
   - [Pairing & Setup](#pairing--setup)
   - [Device Connection Manager](#device-connection-manager)
   - [Firestore Relay Listener](#firestore-relay-listener)
   - [GPS Location Forwarding](#gps-location-forwarding)
   - [Call Initiation & Relay](#call-initiation--relay)
   - [Face Relay Engine](#face-relay-engine)
   - [System Status Relay](#system-status-relay)
   - [Emergency Alerts](#emergency-alerts)
   - [Navigation Destination](#navigation-destination)
8. [Screen Inventory](#screen-inventory)
9. [UI Specification](#ui-specification)
10. [Background Services](#background-services)
11. [Build Plan & Phases](#build-plan--phases)
12. [Pi API Endpoint Reference](#pi-api-endpoint-reference)
13. [Environment Variables](#environment-variables)
14. [Known Constraints](#known-constraints)

---

## Overview

The Iris User App is the second of two React Native applications forming the support network layer of Project Iris. It is installed on a phone kept with or near the Iris user — typically set up by a caregiver or family member on the user's behalf.

The User App has two distinct responsibilities:

**1. User-facing features:**
- Initiate voice and video calls to the caregiver
- Set a navigation destination for the Iris device
- Send emergency alerts to all registered contacts
- Display device status and battery level

**2. Bridge role (invisible to the user):**
- Maintain a persistent local connection to the Raspberry Pi 5 over the local network
- Listen to Firestore for instructions originated by the caregiver app
- Relay those instructions to the Pi via its local HTTP API
- Write Pi responses and status updates back to Firestore for the caregiver app to read

The bridge role is the most technically important part of this app. Without it, the caregiver app has no path to the Pi.

---

## Critical Role: The Local Bridge

The Raspberry Pi 5 runs a local HTTP API (FastAPI on Python). This API is only reachable from within the same local network — it has no public IP address. The User App's phone is assumed to share this local network, either because:

- The phone is acting as a **mobile hotspot** that the Pi connects to via Wi-Fi, or
- Both the phone and Pi are on the **same home or office Wi-Fi network**

The User App discovers the Pi on the local network and maintains a persistent connection. All communication between the outside world (Firebase, caregiver app) and the Pi flows through this bridge.

```
Caregiver App
     │
     ▼
  Firebase (Firestore / Storage)
     │
     ▼
  User App  ◄──── onSnapshot listeners (Firestore)
     │
     ▼  (local HTTP — same network)
  Raspberry Pi 5 Local API
     │
     ▼
  All on-device AI modules (M01–M12)
```

> ⚠️ **BRIDGE NOTICE — READ FIRST**
> Every feature in this app that touches the Pi goes through the local HTTP API. If the Pi is unreachable (out of network range, offline, API not running), those features will fail silently or surface an error. The app must always check Pi reachability before attempting any relay action and surface appropriate status to the user and caregiver. Never assume the Pi is reachable.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo managed workflow) |
| Language | TypeScript |
| Navigation | React Navigation v6 |
| State Management | Zustand |
| Real-time Database | Firebase Firestore |
| File Storage | Firebase Storage |
| Push Notifications | Firebase Cloud Messaging (FCM) |
| Video / Voice Calls | LiveKit (`@livekit/react-native`) |
| Local HTTP Client | Axios (calls to Pi local API) |
| Network Discovery | mDNS / fixed local IP (see Pi API section) |
| Authentication | Firebase Authentication |
| Background Tasks | `expo-background-fetch`, `expo-task-manager` |
| Location | `expo-location` |

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                      IRIS USER APP                         │
│                                                            │
│  ┌───────────────┐   ┌──────────────────────────────────┐  │
│  │  User-Facing  │   │       Bridge Engine              │  │
│  │  Screens      │   │                                  │  │
│  │               │   │  Firestore Relay Listener        │  │
│  │  Home         │   │  Pi Connection Manager           │  │
│  │  Call Screen  │   │  GPS Forwarder                   │  │
│  │  Destination  │   │  Face Relay Engine               │  │
│  │  Settings     │   │  Status Relay                    │  │
│  └───────────────┘   └──────────────┬───────────────────┘  │
└─────────────────────────────────────│────────────────────┘
                                      │
              ┌───────────────────────┼──────────────────┐
              │                       │                  │
              ▼                       ▼                  ▼
       Firebase                  LiveKit           Raspberry Pi 5
       Firestore                 Cloud             Local HTTP API
       Storage                  (calls)            (FastAPI)
       FCM
```

---

## Pi Local HTTP API

> ⚠️ **PI COMMUNICATION NOTICE**
> The Pi runs a FastAPI server on port `8000` (or configurable). All User App calls to the Pi use this API. The base URL is set during pairing and stored in local app state. The Pi API is the single point of entry for all app-to-Pi communication. Every module on the Pi that the app needs to control or query must have a corresponding endpoint on this API.

### Pi Discovery & Connection

**Option A — Mobile Hotspot (recommended for prototype):**
The phone creates a Wi-Fi hotspot. The Pi connects to it. The Pi's IP on the hotspot network is typically predictable (e.g., `192.168.43.xxx`). The app pings `192.168.43.0/24` on port 8000 during setup to discover the Pi.

**Option B — Fixed Local IP:**
The Pi is configured with a static IP on the local network. The IP is entered manually during the pairing flow.

**Option C — mDNS (cleanest long-term):**
The Pi advertises itself as `iris-device.local` via Avahi/mDNS. The app resolves this hostname. Most reliable for changing IPs.

**Recommendation for prototype:** Use Option A (hotspot) with Option B as fallback. Implement Option C in Phase U5 or later.

### Connection Health Check

The app pings the Pi every 30 seconds:
```
GET /ping
Response: { status: "ok", deviceId: string, uptime: number }
```

If the ping fails 3 consecutive times, the app marks the Pi as unreachable, updates Firestore, and alerts the user via on-screen banner.

---

## App–Pi Communication

The table below lists every point at which the User App communicates with the Pi, the trigger for that communication, and the Pi endpoint involved.

> ⚠️ **PI COMMUNICATION NOTICE**
> All entries in this table represent direct HTTP calls from the User App to the Pi's local API. These are the only points of direct app-to-Pi communication in the entire Iris system. The Caregiver App never calls this API directly.

| Trigger | Direction | Pi Endpoint | Payload |
|---|---|---|---|
| App startup / reconnect | App → Pi | `GET /ping` | — |
| Status heartbeat (every 30s) | Pi → App (poll) | `GET /status` | — |
| GPS update (every 10–60s) | App → Pi | `POST /location/update` | `{ lat, lng, accuracy }` |
| Face add (from Firestore relay) | App → Pi | `POST /faces/add` | `{ faceId, name, imageData: base64 }` |
| Face delete (from Firestore relay) | App → Pi | `DELETE /faces/{faceId}` | — |
| Face rename (from Firestore relay) | App → Pi | `PATCH /faces/{faceId}` | `{ name }` |
| Navigation destination set | App → Pi | `POST /navigation/destination` | `{ destination: string }` |
| Incoming call signal (from Firestore) | App → Pi | `POST /call/join` | `{ roomName, token }` |
| Call ended | App → Pi | `POST /call/end` | — |
| Emergency alert (from caregiver) | App → Pi | `POST /alert/announce` | `{ message: string }` |
| User emergency trigger | App → Pi | `POST /alert/emergency` | — |
| Module health request | App → Pi | `GET /modules/health` | — |

---

## Feature Modules

### Pairing & Setup

The User App is typically set up by a sighted caregiver or family member on behalf of the blind user.

**Flow:**
1. App installed on the user's phone
2. Firebase account created (linked to the Iris device)
3. A 6-digit pairing code is generated and displayed on screen
4. Caregiver enters this code in the Caregiver App to link both apps to the same device
5. Pi's local IP or hostname is entered during this setup flow
6. App performs the first `GET /ping` to confirm Pi is reachable
7. If ping succeeds, pairing is complete — the Pi IP/hostname is stored in secure local storage

> ⚠️ **PI COMMUNICATION NOTICE**
> The first direct communication with the Pi happens during pairing step 6. If the ping fails, the pairing flow must surface a clear error: "Cannot reach Iris device. Make sure the device is on and your phone is connected to the same network." Do not allow the pairing to complete if the Pi is unreachable.

---

### Device Connection Manager

A persistent background service that maintains the Pi connection and writes connection status to Firestore.

**Responsibilities:**
- Ping the Pi every 30 seconds via `GET /ping`
- On successful ping: write `status: "online"` and `lastSeen: now()` to `/devices/{deviceId}` in Firestore
- On 3 consecutive failures: write `status: "offline"` to Firestore, display banner in app
- On reconnection after offline: perform a status fetch (`GET /status`) and write full status payload to Firestore
- Track and expose Pi reachability as a global Zustand state flag (`piReachable: boolean`) — all relay actions check this flag before proceeding

---

### Firestore Relay Listener

The most important background service in the app. It listens to Firestore for caregiver-originated instructions and relays them to the Pi.

**Active listeners:**

```typescript
// 1. Face changes
db.collection('devices').doc(deviceId)
  .collection('faces')
  .onSnapshot(handleFaceChanges);

// 2. Call signal
db.collection('devices').doc(deviceId)
  .doc('callSignal')
  .onSnapshot(handleCallSignal);

// 3. Emergency alerts from caregiver
db.collection('devices').doc(deviceId)
  .collection('alerts')
  .onSnapshot(handleAlerts);
```

**Relay logic for each listener:**
- On snapshot change, diff against last known state to identify what changed
- Check `piReachable` flag — if false, queue the action and retry when Pi comes back online
- Execute the appropriate Pi API call
- On Pi success, update the Firestore record with the confirmation (e.g., set `status: "synced"` on a face record)
- On Pi failure, set `status: "failed"` and optionally surface a push notification to the caregiver

> ⚠️ **PI COMMUNICATION NOTICE**
> The Firestore relay listener must run in the background even when the app is not in the foreground. Use `expo-task-manager` and `expo-background-fetch` for background execution. iOS background execution time is limited — prioritise the most critical relays (call signal, emergency alert) and accept that face syncing may be deferred until the app returns to foreground on iOS.

---

### GPS Location Forwarding

The User App forwards GPS coordinates in two directions: to Firestore (for the caregiver map) and to the Pi (so the navigation module has access to current position).

> ⚠️ **PI COMMUNICATION NOTICE**
> The Pi's Navigation Module (M09) depends on receiving GPS coordinates from the User App. The Pi does not have its own GPS hardware. Every GPS position update the app receives must be sent to the Pi via `POST /location/update`. If GPS updates stop (app goes background, location permission revoked), the Pi navigation module will be operating on stale data. The Pi must handle this gracefully (M09 should detect stale GPS and announce to the user that GPS is unavailable).

**Implementation:**
```typescript
import * as Location from 'expo-location';

// Request always-on location permission during setup
await Location.requestBackgroundPermissionsAsync();

// Start watching position
Location.watchPositionAsync(
  { accuracy: Location.Accuracy.High, distanceInterval: 5 },
  async (location) => {
    const { latitude, longitude, accuracy } = location.coords;

    // 1. Write to Firestore for caregiver map
    await db.collection('devices').doc(deviceId)
      .collection('location').doc('current')
      .set({ lat: latitude, lng: longitude, accuracy, updatedAt: serverTimestamp() });

    // 2. Send to Pi
    await piApi.post('/location/update', { lat: latitude, lng: longitude, accuracy });
  }
);
```

**Update intervals:**
- Navigation active: every 5 metres of movement
- Navigation idle: every 60 seconds
- App backgrounded: every 60 seconds (background location task)

---

### Call Initiation & Relay

**User initiates a call (via app — for sighted setup helpers or emergency use):**
1. User (or helper) taps "Call Caregiver" on Home screen
2. App writes call signal to Firestore: `{ initiatedBy: "user", roomName: "iris-{deviceId}-{timestamp}", status: "ringing" }`
3. FCM push notification sent to caregiver via Cloud Function
4. App also relays call join to Pi: `POST /call/join` with `{ roomName, token }`
5. Pi joins LiveKit room and begins publishing camera + mic
6. App waits for caregiver to join (Firestore `callSignal.status` changes to `"active"`)
7. App displays active call screen

> ⚠️ **PI COMMUNICATION NOTICE**
> The `POST /call/join` call to the Pi is the instruction for the Pi to join the LiveKit room as a publisher. This must include a valid LiveKit token fetched from the token server — the Pi needs its own token, separate from the caregiver's token. Fetch the Pi's token from the token server with participant name `"iris-pi"` and the correct room name before sending the join instruction to the Pi. If the token fetch fails, the call cannot proceed — surface this as "Could not connect to Iris device. Try again."

**Pi-initiated call (user says "Iris, call my caregiver"):**
1. Pi writes call signal to Firestore via the User App relay — Pi calls `POST /call/signal` on its own local API, which the User App relays to Firestore
2. Actually: simpler approach — the Pi tells the User App via a local push (WebSocket or long-poll on `GET /events`) that it wants to initiate a call
3. User App receives the event, writes to Firestore, FCM notifies caregiver
4. This is the **Pi → User App → Firestore → Caregiver App** flow for Pi-initiated calls

> ⚠️ **PI COMMUNICATION NOTICE**
> Implement a lightweight event stream endpoint on the Pi: `GET /events` (Server-Sent Events or long-poll). The User App maintains a persistent connection to this endpoint to receive Pi-initiated events (call requests, emergency triggers). This is the only Pi → App push mechanism. All other communication is App → Pi (pull/request).

**Call ended:**
1. Either side ends the call
2. Firestore `callSignal.status` updated to `"ended"`
3. App sends `POST /call/end` to Pi
4. Pi's System State Manager (M12) performs full recalibration before resuming all system outputs — no action required from the app after sending the end signal

---

### Face Relay Engine

This service is a subset of the Firestore Relay Listener, dedicated specifically to the face onboarding flow.

> ⚠️ **PI COMMUNICATION NOTICE**
> The Pi receives raw images from the User App and performs all embedding generation locally. The User App is responsible for downloading the image from Firebase Storage and sending it to the Pi as a base64-encoded payload. The Pi does NOT fetch from Firebase Storage directly — it has no Firebase credentials and should not need them. All external file access on behalf of the Pi is the User App's responsibility.

**Add face relay:**
```typescript
async function relayFaceAdd(face: FaceRecord) {
  // 1. Download image from Firebase Storage
  const imageBlob = await downloadFromStorage(face.imageUrl);
  const base64 = await blobToBase64(imageBlob);

  // 2. Send to Pi
  const response = await piApi.post('/faces/add', {
    faceId: face.id,
    name: face.name,
    imageData: base64,
  });

  // 3. Update Firestore on success
  if (response.data.success) {
    await db.collection('devices').doc(deviceId)
      .collection('faces').doc(face.id)
      .update({ status: 'synced' });

    // 4. Optional: delete image from Firebase Storage to save quota
    await deleteFromStorage(face.imageUrl);
  } else {
    await db.collection('devices').doc(deviceId)
      .collection('faces').doc(face.id)
      .update({ status: 'failed' });
  }
}
```

**Queue management:**
- If the Pi is unreachable when a face relay is attempted, add the face to a local pending queue (AsyncStorage)
- Retry the queue every time Pi reachability is restored
- Surface queue length as a badge on the User App Home screen: "3 faces pending sync"

---

### System Status Relay

Every 30 seconds, the app polls `GET /status` on the Pi and writes the response to Firestore.

> ⚠️ **PI COMMUNICATION NOTICE**
> `GET /status` is the single most important Pi endpoint for the support network layer. The Pi's System State Manager (M12) must assemble a complete status payload on this endpoint including battery level, all module health flags, current operating mode, and GPS signal quality. The app writes this payload verbatim to Firestore. The caregiver app reads it. Design the Pi status payload carefully — it is the source of truth for all remote monitoring.

**Expected Pi status payload:**
```json
{
  "battery": 74,
  "status": "online",
  "mode": "normal",
  "gpsSignal": "strong",
  "modules": {
    "obstacleDetection": true,
    "objectDetection": true,
    "faceRecognition": true,
    "voiceInteraction": true,
    "navigation": true,
    "cameraPipeline": true
  },
  "uptime": 3820
}
```

---

### Emergency Alerts

**User-triggered emergency (via app):**
1. User (or helper) taps Emergency button
2. Confirmation dialog
3. App writes alert to Firestore → Cloud Function sends FCM to all contacts
4. App sends `POST /alert/emergency` to Pi → Pi announces verbally to user that help has been alerted

**Caregiver-triggered emergency (relayed to Pi):**
1. Firestore alert listener detects new alert with `triggeredBy: "caregiver"`
2. App sends `POST /alert/announce` to Pi with message
3. Pi's LLM Synthesizer (M07) speaks the message via Edge TTS through bone conduction

> ⚠️ **PI COMMUNICATION NOTICE**
> Emergency alert relay to the Pi must be treated as highest priority. If the Pi is temporarily unreachable, retry immediately and aggressively (every 5 seconds for up to 2 minutes) before giving up. Surface a failure state to Firestore if the announcement could not be delivered so the caregiver is informed.

---

### Navigation Destination

The user or a helper can set a navigation destination from the app rather than by voice.

> ⚠️ **PI COMMUNICATION NOTICE**
> Setting a destination from the app sends the destination string to the Pi via `POST /navigation/destination`. The Pi's Navigation Module (M09) then processes it identically to a voice-initiated destination — it calls the routing API and begins turn-by-turn guidance. The app does not participate in navigation beyond delivering the destination. Navigation state is managed entirely on the Pi.

**UI:**
- Large text input field with autocomplete (Google Places Autocomplete API)
- "Set Destination" button — primary blue, full width
- After sending: confirmation banner "Destination set. Iris will begin navigation shortly."
- "Cancel Navigation" option appears while a destination is active (sends `POST /navigation/cancel` to Pi)

---

## Screen Inventory

| Screen | Route Name | Description |
|---|---|---|
| Pairing | `Pairing` | Device code display, Pi IP entry, first connection |
| Home | `Home` | Status, call button, destination input, emergency button |
| Call Screen | `CallScreen` | Active call UI (audio only for blind user) |
| Settings | `Settings` | Caregiver contact info, notification prefs, replay onboarding |
| Emergency Confirm | `EmergencyConfirm` | Confirmation step before alert is sent |

The User App is intentionally minimal. The blind user primarily interacts with Iris via voice. This app is mostly operated by sighted helpers and runs the bridge engine silently in the background.

---

## UI Specification

### Design Principles

The User App prioritises accessibility and simplicity. Assume a sighted helper is setting it up but a blind user may occasionally interact with it independently (by touch and screen reader).

- All interactive elements have large touch targets (minimum 60px height)
- All buttons are clearly labelled with full descriptive text (no icon-only buttons)
- All text is large (minimum 16sp body)
- Full VoiceOver / TalkBack support
- High contrast — white background, dark text, strong blue accents

### Brand Colours (same system as Caregiver App)

```typescript
export const colors = {
  background:       '#FFFFFF',
  primary:          '#1A6BFF',
  primaryLight:     '#E8F0FF',
  primaryDark:      '#0047CC',
  textPrimary:      '#0D0D0D',
  textSecondary:    '#6B7280',
  textOnPrimary:    '#FFFFFF',
  divider:          '#F0F0F0',
  success:          '#16A34A',
  successLight:     '#DCFCE7',
  warning:          '#F59E0B',
  warningLight:     '#FEF3C7',
  danger:           '#DC2626',
  dangerLight:      '#FEE2E2',
  offline:          '#9CA3AF',
};
```

### Home Screen Layout

```
┌─────────────────────────────────┐
│  IRIS                [Settings] │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │  ● Online  · Battery 74%  │  │  ← Status card (blue border if online)
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │                           │  │
│  │      CALL CAREGIVER       │  │  ← Large primary button
│  │                           │  │
│  └───────────────────────────┘  │
│                                 │
│  Set Destination                │
│  ┌───────────────────────────┐  │
│  │  Enter destination...     │  │
│  └───────────────────────────┘  │
│  [ Set Destination ]            │
│                                 │
│  ┌───────────────────────────┐  │
│  │   ⚠ EMERGENCY ALERT       │  │  ← Danger red button, full width
│  └───────────────────────────┘  │
│                                 │
│  3 faces pending sync ↑         │  ← Only shown if queue > 0
└─────────────────────────────────┘
```

### Call Screen Layout

```
┌─────────────────────────────────┐
│                                 │
│       Calling Caregiver...      │
│         [Name]                  │
│                                 │
│         00:00:14                │  ← Call duration timer
│                                 │
│                                 │
│  ┌──────────┐  ┌─────────────┐  │
│  │   Mute   │  │  End Call   │  │  ← Large buttons, accessible
│  └──────────┘  └─────────────┘  │
└─────────────────────────────────┘
```

---

## Background Services

Two background tasks must run even when the app is not in the foreground:

**Task 1 — Pi Heartbeat & Status Relay**
- Runs every 30 seconds
- Pings Pi, fetches status, writes to Firestore
- Registered with `expo-task-manager` as `IRIS_HEARTBEAT`

**Task 2 — GPS Location Forwarding**
- Runs on significant location change
- Forwards coordinates to Pi and Firestore
- Registered with `expo-task-manager` as `IRIS_LOCATION`

**Task 3 — Firestore Relay Listener**
- Persistent Firestore `onSnapshot` subscriptions
- Must be re-established if app is force-closed and reopened
- Firestore SDK maintains this automatically while the app is in memory

> ⚠️ **PI COMMUNICATION NOTICE**
> Background tasks on iOS are subject to system throttling and may not run exactly on schedule. Design all Pi-dependent features to be resilient to delayed relay. The Pi should not assume GPS data will arrive on a precise interval — it must timestamp all received location data and degrade gracefully when data is stale. Communicate this constraint to the Pi software lead.

---

## Build Plan & Phases

### Phase U1 — Foundation
- Expo project setup with TypeScript
- Firebase SDK integration
- Firebase Authentication
- Pairing screen and 6-digit code generation
- Pi local IP entry and first ping validation
- Navigation shell

### Phase U2 — Bridge Engine
- Pi Connection Manager (heartbeat, reachability flag)
- Firestore Relay Listener skeleton (onSnapshot subscriptions)
- Zustand store: `piReachable`, `deviceStatus`, `pendingQueue`
- Home screen status card (online/offline, battery)

### Phase U3 — GPS Forwarding
- `expo-location` background permission request
- `watchPositionAsync` with dual write (Firestore + Pi)
- Background location task registration
- Stale GPS detection and Pi notification

### Phase U4 — Call Relay
- LiveKit SDK integration
- Pi event stream listener (`GET /events` SSE connection)
- User-initiated call flow (Firestore write + `POST /call/join` to Pi)
- Pi-initiated call relay (event stream → Firestore write → FCM)
- Call screen UI
- `POST /call/end` relay with Pi acknowledgement

### Phase U5 — Face Relay Engine
- Firestore face listener
- Firebase Storage download helper
- Base64 encoding and `POST /faces/add` relay
- `DELETE` and `PATCH` relay for delete/rename
- Pending queue with AsyncStorage persistence
- Queue retry on Pi reconnection
- Pending count badge on Home screen

### Phase U6 — Status & Emergency
- `GET /status` poll and Firestore write (full module health payload)
- Emergency alert button with confirmation
- Caregiver-alert relay: Firestore listener → `POST /alert/announce` to Pi
- User emergency: `POST /alert/emergency` + Firestore alert write

### Phase U7 — Navigation Destination
- Google Places Autocomplete integration
- `POST /navigation/destination` relay
- `POST /navigation/cancel` relay
- Active destination state on Home screen

### Phase U8 — Accessibility & Polish
- Full VoiceOver / TalkBack audit
- Touch target size audit (all interactive elements ≥ 60px)
- Text size and contrast audit
- Error states for all Pi-unreachable scenarios
- Retry logic audit for all relay actions

### Phase U9 — Integration Testing
- End-to-end face relay test (caregiver app → Firebase → User App → Pi → embed → confirm)
- GPS forwarding latency test
- Background task reliability test (app backgrounded for 10+ minutes)
- Call relay test with Pi LiveKit join
- Emergency relay under poor network conditions
- Pi offline scenarios: all relay actions must queue and retry

---

## Pi API Endpoint Reference

> ⚠️ **PI COMMUNICATION NOTICE**
> This is the complete contract between the User App and the Pi's local FastAPI server. The Pi software lead must implement all endpoints in this table. Any change to endpoint paths, payloads, or response formats must be coordinated between the app and Pi developers before implementation.

| Method | Endpoint | Request Body | Success Response | Description |
|---|---|---|---|---|
| `GET` | `/ping` | — | `{ status: "ok", deviceId, uptime }` | Health check |
| `GET` | `/status` | — | Full status payload (see above) | Full system status |
| `GET` | `/events` | — | SSE stream | Pi-initiated event stream |
| `GET` | `/modules/health` | — | `{ modules: { ... } }` | Per-module health flags |
| `POST` | `/location/update` | `{ lat, lng, accuracy }` | `{ received: true }` | GPS update |
| `POST` | `/faces/add` | `{ faceId, name, imageData }` | `{ success: true }` | Add face (Pi generates embedding) |
| `DELETE` | `/faces/{faceId}` | — | `{ success: true }` | Remove face from database |
| `PATCH` | `/faces/{faceId}` | `{ name }` | `{ success: true }` | Rename face in database |
| `POST` | `/navigation/destination` | `{ destination }` | `{ received: true }` | Set navigation destination |
| `POST` | `/navigation/cancel` | — | `{ received: true }` | Cancel active navigation |
| `POST` | `/call/join` | `{ roomName, token }` | `{ joined: true }` | Pi joins LiveKit room |
| `POST` | `/call/end` | — | `{ received: true }` | Pi ends call and recalibrates |
| `POST` | `/alert/emergency` | — | `{ received: true }` | Pi triggers emergency mode |
| `POST` | `/alert/announce` | `{ message }` | `{ received: true }` | Pi speaks message via TTS |

**Error format (all endpoints):**
```json
{ "success": false, "error": "description of what went wrong" }
```

---

## Environment Variables

```env
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
LIVEKIT_URL=wss://your-livekit-cloud-url
TOKEN_SERVER_URL=https://your-token-server.railway.app
PI_LOCAL_IP=192.168.43.xxx        # Set during pairing, stored in secure storage
PI_API_PORT=8000
GOOGLE_PLACES_API_KEY=
```

---

## Known Constraints

- **iOS background limits:** iOS aggressively suspends background tasks. The Pi heartbeat and GPS forward tasks will not run on a precise 30-second schedule when the app is backgrounded. The Pi must tolerate gaps in GPS and status data. Test extensively on a physical iPhone — the iOS simulator does not replicate background behaviour accurately.

- **Pi network dependency:** If the user moves out of hotspot range, the bridge breaks. All Pi features fail. The caregiver app will show the device as offline after 60 seconds. The Pi's core features (navigation, obstacle detection, voice) continue operating independently — only the support network layer is affected.

- **Local IP changes:** If the phone restarts the hotspot, the Pi may receive a different IP. Build a reconnection flow that re-runs Pi discovery if the stored IP stops responding.

- **Face image size:** Large images will cause slow base64 encoding and slow relay. Compress images to under 200KB before upload on the Caregiver App side. The Pi should also validate the received image size and reject payloads above a defined limit.

- **Firestore onSnapshot and memory:** Multiple simultaneous Firestore listeners can cause memory pressure. Unsubscribe all listeners on app unmount or logout. Keep the number of active listeners to the minimum necessary.

- **LiveKit token expiry:** LiveKit tokens have an expiry time (default 6 hours). If a call is initiated after token expiry, the join will fail. Fetch a fresh token immediately before every call join — never cache tokens.

- **GPS accuracy in Lagos:** Expect 5–15 metre drift in dense urban areas. Forward raw accuracy values to the Pi so the Navigation Module (M09) can account for this. Do not round or truncate accuracy values before sending.

---

*Iris User App · Developer Documentation · v0.1 · April 2026 · Confidential — Team Use Only*
