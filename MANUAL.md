# MPGS TaskFlow - Enterprise Communication & Task Portal
**Current Version:** v1.12.0
**Last Updated:** Phase 1 Modularization (Chat & Tasks)

## 📖 Architecture Overview
MPGS TaskFlow is a lightweight, real-time enterprise chat and task delegation portal designed for educational leadership. It runs on a vanilla HTML/JS/Tailwind frontend powered securely by a **Supabase (PostgreSQL)** backend.

## 📂 Folder Structure
* `index.html` -> The entry point. Loads Tailwind, Fonts, and initializes `main.js`.
* `css/theme.css` -> Global CSS variables, custom UI styling, and animations.
* `js/shared.js` -> Central nervous system. Holds Supabase DB keys, global helpers (time formatting), and global state (`window.currentUser`).
* `js/tasks.js` -> **[LOCKED]** The highly complex Task State Machine. Handles creation, delegation, submission, and PDF generation.
* `js/main.js` -> Handles Auth (Login/Signup), Top Panels (Bookmarks/Reminders), and the Core Chat/Reply messaging UI.

## ⚙️ The Task State Machine (Rules)
1. **Pending Ack:** Task assigned. Assignee must acknowledge.
2. **In Progress:** Assignee working. Can update trail, upload files, or delegate.
3. **Submitted:** Assignee submits. Card locks for them. Awaits Reviewer.
4. **Needs Review:** Reviewer requests rework (mandatory feedback). Back to Assignee.
5. **Accepted (Done):** Terminal state.
