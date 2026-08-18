# Supabase Cloud Database Keep-Alive Service 🚀

Automated GitHub Actions workflow and Node.js script that sends a daily HTTP request to keep your Supabase Cloud project active and prevent project pausing due to inactivity.

---

## ⚙️ Target Endpoint & Schedule

| Target | Endpoint | Frequency |
|---|---|---|
| **Supabase Cloud DB** | `https://ngjckggjadtoevbnhjhi.supabase.co/rest/v1/comments?select=id&limit=1` | **Once Daily (Every 24h)** (Prevents project pausing) |

---

## 📌 How Scheduling Works

1. **Supabase Cloud DB (24-hour interval)**: Supabase free projects pause after 7 days of inactivity. A single database query request once every 24 hours keeps the Supabase project active without generating unnecessary traffic.
2. **Smart History Inspection**: The script checks [`pings.json`](pings.json) before each cycle to evaluate whether 24 hours have elapsed since the last Supabase ping.

---

## ✨ Execution Flags

- `node ping.js` : Executes a daily ping cycle (respects 24-hour interval).
- `node ping.js --force` : Forces an immediate ping attempt, ignoring schedule delays.
- `node ping.js --loop` : Runs locally in a continuous 24-hour loop.

---

## 🚀 Deployment

Commit and push updated files to GitHub:

```bash
git add .
git commit -m "Configure daily Supabase keep-alive ping workflow"
git push origin main
```
