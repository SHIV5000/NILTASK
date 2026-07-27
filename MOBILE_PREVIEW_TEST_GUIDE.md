# NILTASK Mobile Branch Preview Test Guide

## Which mobile test method to use

### 1. Phone browser / PWA test

Use the same PR preview URL on the phone:

```text
https://niltask-git-agent-activity-feed-no-flicker-shiv5000s-projects.vercel.app
```

Open it in Chrome on Android. Because the phone viewport is small, NILTASK automatically uses the mobile shell.

This method covers:

- mobile layout and navigation;
- messages, DMs, replies and reactions;
- Tasks and Activity;
- unread row/bell counts;
- service-worker update and offline PWA behavior;
- background/resume in Chrome or an installed PWA.

To test the installed PWA:

1. Open the preview URL in Chrome.
2. Tap Chrome's three-dot menu.
3. Choose **Install app** or **Add to Home screen**.
4. Name it **NILTASK Preview PWA** if Android asks.
5. Open it from the new home-screen icon.

### 2. Native Android preview APK

The normal production Android app is configured to open:

```text
https://niltask.vercel.app
```

It therefore cannot display unmerged branch changes.

The branch includes a separate GitHub Actions workflow named:

```text
Build Mobile Preview APK
```

It creates:

```text
App name:   NILTASK Preview
Package ID: in.niltask.preview
Server URL: PR #204 Vercel preview
```

Because its package ID differs from production, the preview and production apps can be installed together.

The workflow artifact is named:

```text
NILTASK-Preview-PR204
```

To download it from GitHub later:

1. Open the repository.
2. Open **Actions**.
3. Select **Build Mobile Preview APK**.
4. Open the latest successful run.
5. Download **NILTASK-Preview-PR204** under Artifacts.
6. Extract the ZIP and install `NILTASK-Preview-PR204.apk`.

Android may ask permission to install an app from the browser or Files app. Allow it only for this installation, install the APK, and then turn that permission off again if desired.

## Before every test pass

1. Confirm the preview URL opens.
2. Fully close the preview browser/PWA/APK.
3. Remove it from Android's recent-apps screen.
4. Reopen it.
5. Sign in with a test account.
6. Keep the normal production app clearly separate from **NILTASK Preview**.

## Core mobile acceptance pass

Use two accounts where possible: one sender and one receiver.

### Messages and unread

- Send one message to a closed group.
- Receiver's group unread count increases by exactly one.
- Global/bell/app badge increases by exactly one overall.
- No duplicate bubble, toast or sound appears.
- Open that group; its unread count becomes zero.
- While the group remains open, send another message; it appears once and does not become unread.
- Repeat with a DM involving the receiver.
- Confirm an unrelated DM never appears or changes the receiver's count.

### Replies, mentions and reactions

- Send one reply and one mention.
- Confirm each is presented once.
- Add one reaction from the second account; the count increases by one.
- Remove it; the count decreases by one.
- Confirm typing status still appears.

### Tasks and Activity

- Create or update one Task affecting the receiver.
- Confirm the Task update appears once.
- Open Activity repeatedly and verify no flicker, blank upper half or scroll jump.
- Test Activity filters and exact message/Task navigation.

### Presence and recovery

- Confirm the other active account shows online.
- Put the preview app in the background for several minutes.
- Resume it and send another message.
- Confirm missed data catches up without duplicates.
- For the long-session gate, keep it open for at least 30 minutes and background/resume several times.

### Logout and identity changes

- Log out.
- Sign in again on the same preview app.
- Expect one controlled reload.
- Confirm there is only one fresh mobile realtime/presence session.
- Confirm no prior-user message, badge, toast or callback appears.
- Repeat with another account or tenant when available.

## PWA/offline acceptance

After one successful online load:

1. Open the installed preview PWA.
2. Confirm it updates to cache generation `taskflow-v210`.
3. Turn off mobile data and Wi-Fi.
4. Reopen the preview PWA.
5. Confirm the offline shell loads instead of a blank screen.
6. Restore the network and confirm the app reconnects.
7. Confirm there is no repeated reload loop.

## Native-only APK acceptance

Use the preview APK for checks that a browser/PWA cannot fully prove:

- Android back-button behavior;
- Capacitor app background/foreground lifecycle;
- native push registration and foreground suppression;
- native app-icon badge where supported;
- keyboard/composer behavior inside Android WebView;
- coexistence with the production app.

## Reporting a problem

For every issue, send:

- a screenshot or short screen recording;
- the exact action performed;
- which preview was used: Chrome, installed PWA or **NILTASK Preview** APK;
- sender and receiver context without sharing passwords;
- whether the app was foregrounded, backgrounded or reopened;
- whether the problem happened once or on every attempt.

Do not test the preview by changing or merging `main`. PR #204 remains the isolated test environment until explicit owner approval.
