# Congressional App Challenge — 3:00 tap script

Film the phone in portrait. Stay signed in. Leave recording length at **30 s**. Do not lock or switch apps during a reading.

If you can, save **two rest readings** before you hit record so History and Insights are not empty.

---

### 0:00–0:20  The problem
**Show:** Measure tab, don’t tap yet.

**Say:** “Essential tremor is one of the most common movement disorders. People guess how bad a day is. Tremor Tracker turns a phone into a 30-second reading they can keep and show a clinician.”

---

### 0:20–0:32  Accessibility (one beat)
**Do:** Settings → Accessibility & display → tap **Apply** (tremor preset) → back.

**Say:** “It’s built for tremor: bigger buttons, extra taps ignored, text you can enlarge.”

Skip this cut if you are already on the large-button preset.

---

### 0:32–0:40  Start a rest reading
**Do:** Measure tab → Rest → **Start**.

**Say:** “Rest tremor, phone still. Three-second countdown, then it listens to the accelerometer.”

---

### 0:40–1:13  Countdown + 30 s capture
**Do:** Hold still. Do not leave the screen.

**Talk over the ring:** “It resamples to 100 Hz, looks at the 4–12 Hz tremor band, and pulls amplitude and rate. That’s the same pipeline used in the research code, running on the phone.”

---

### 1:13–1:38  Result + save
**Do:** Point at the headline (how strong, how many times a second). Scroll once. Add one tag if you want (e.g. caffeine). **Save**.

**Say:** “Plain language first, then the numbers. Save it to the account — it also works offline and syncs later.”

---

### 1:38–1:55  History
**Do:** History tab. Point at the trend sentence and the chart.

**Say:** “Over days you see whether rest readings are up or down — not a one-off guess.”

---

### 1:55–2:12  Insights
**Do:** Insights tab. Point at a tip or the weekly recap.

**Say:** “It compares *your* tagged days — sleep, caffeine, meds — and suggests what to try. Not a diagnosis.”

---

### 2:12–2:32  Privacy on the phone
**Do:** Settings → Account. Point at the email, **Two-step sign-in**, **Sign out**. Do **not** enroll 2FA on camera.

**Say:** “Sign-in is required. Optional two-step with an authenticator. Each account only sees its own rows.”

---

### 2:32–2:52  Encryption slide (laptop)
**Do:** Fullscreen `docs/challenge/encryption.html` in a browser. Press **Space** once (encrypt), wait, **Space** again (decrypt).

**Say:** “On the wire the reading is AES-256-GCM inside TLS. The login token lives in the iOS Keychain. In the cloud, row-level security means even the database only returns *your* sessions.”

---

### 2:52–3:00  Close
**Do:** Cut back to the Measure tab.

**Say:** “Not a medical device. A record you can take to the doctor. Tremor Tracker.”

---

## If something goes wrong

| Problem | Fix |
|---|---|
| Recording aborts | You backgrounded the app. Restart the reading; don’t cut. |
| Empty History | Skip Insights; spend the time on the result screen. |
| Login screen appears | You signed out. Stop, sign in, start the take over. |
| 2FA code screen | You still have two-step on. Enter the code off-camera, or turn it off in Settings first. |
