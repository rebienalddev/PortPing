# Render & Supabase Web Service Keep-Alive Service 🚀

Automated GitHub Actions workflow and Node.js script that sends periodic HTTP GET requests to keep your free Render web service active and prevent Supabase project pausing due to inactivity.

---

## ⚙️ Target Endpoints & Schedule

| Target | Endpoint | Frequency |
|---|---|---|
| **Render Portfolio App** | `https://portfolio-frk8.onrender.com` | **Every 5 Minutes** (Prevents cold starts) |
| **Supabase Cloud DB** | `https://ngjckggjadtoevbnhjhi.supabase.co/rest/v1/` | **Once Daily (Every 24h)** (Prevents project pausing) |

---

## 📌 How Per-Target Scheduling Works

1. **Render App (5-min interval)**: Render free web services sleep after 15 minutes of inactivity. Pinging every 5 minutes ensures 100% uptime.
2. **Supabase Cloud DB (24-hour interval)**: Supabase projects pause after 7 days of inactivity. A single ping once every 24 hours (86,400,000 ms) keeps the Supabase project active without generating unnecessary traffic.
3. **Smart History Inspection**: The script checks [`pings.json`](pings.json) before each cycle to evaluate whether 24 hours have elapsed since the last Supabase ping.

---

## ✨ Execution Flags

- `node ping.js --single` : Executes a single cycle, respecting target schedules (skips Supabase if pinged <24h ago).
- `node ping.js --single --force` : Forces an immediate ping to all targets, ignoring schedule delays.
- `node ping.js --loop` : Runs locally in a continuous 5-minute loop.

---

## 🚀 Deployment

Commit and push updated files to GitHub:

```bash
git add .
git commit -m "Configure 5-minute Render pings and 24-hour daily Supabase pings"
git push origin main
```
