/**
 * Render & Supabase Web Service Keep-Alive Ping Script (Instant Live Sync Edition)
 * -------------------------------------------------------------------
 * Targets:
 *  - Render Portfolio App: Pinged EVERY 5 MINUTES (Keeps Render free web service warm)
 *  - Supabase Cloud Database: Pinged ONCE DAILY (Every 24 Hours)
 */

import { setTimeout } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Flags
const IS_SINGLE_SHOT = process.argv.includes('--single') || process.env.SINGLE === 'true';
const IS_LOOP_MODE = process.argv.includes('--loop') || process.env.LOOP === 'true';
const IS_FORCE_MODE = process.argv.includes('--force') || process.env.FORCE === 'true';

// Configuration
const TARGET_URLS = [
  {
    name: 'Render Portfolio App',
    url: 'https://portfolio-frk8.onrender.com',
    headers: {
      'User-Agent': 'RenderKeepAlivePing/1.0 (+https://github.com)'
    },
    intervalMs: 0 // 0 = Ping on every 5-minute cycle
  },
  {
    name: 'Supabase Cloud Database',
    url: 'https://ngjckggjadtoevbnhjhi.supabase.co/rest/v1/',
    headers: {
      'User-Agent': 'RenderKeepAlivePing/1.0 (+https://github.com)',
      'apikey': 'sb_publishable_zFd8VxxbMxpu7wFblnC36w_8Np8JVVf',
      'Authorization': 'Bearer sb_publishable_zFd8VxxbMxpu7wFblnC36w_8Np8JVVf'
    },
    intervalMs: 24 * 60 * 60 * 1000 // 24 Hours (Daily Ping)
  }
];

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000; // 10 seconds delay between retries

// Ping Interval: EXACTLY EVERY 5 MINUTES
const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// GitHub Actions maximum session duration: 350 minutes (~5.8 hours)
const TOTAL_SESSION_DURATION_MS = 350 * 60 * 1000;

/**
 * Format a Date object into a readable UTC timestamp string.
 * @returns {string} ISO timestamp
 */
function getFormattedTimestamp() {
  return new Date().toISOString();
}

/**
 * Get timestamp of last recorded ping for a specific target.
 * @param {string} targetUrl 
 * @param {string} targetName 
 * @returns {number} epoch timestamp in ms (0 if not found)
 */
function getLastPingTimestamp(targetUrl, targetName) {
  const pingsFilePath = path.join(process.cwd(), 'pings.json');
  try {
    if (fs.existsSync(pingsFilePath)) {
      const rawData = fs.readFileSync(pingsFilePath, 'utf8');
      const history = JSON.parse(rawData);
      const matching = history.filter(p =>
        (p.targetName && p.targetName === targetName) ||
        (p.targetUrl && p.targetUrl === targetUrl)
      );
      if (matching.length > 0) {
        const lastRecord = matching[matching.length - 1];
        return new Date(lastRecord.timestamp).getTime();
      }
    }
  } catch (err) {
    // Return 0 if file unreadable
  }
  return 0;
}

/**
 * Determine whether a target is due for a ping cycle.
 * @param {object} targetConfig 
 * @returns {boolean}
 */
function shouldPingTarget(targetConfig) {
  if (IS_FORCE_MODE) return true;
  if (!targetConfig.intervalMs || targetConfig.intervalMs <= 0) return true;

  const lastPingTime = getLastPingTimestamp(targetConfig.url, targetConfig.name);
  if (!lastPingTime) return true;

  const elapsedMs = Date.now() - lastPingTime;
  if (elapsedMs >= targetConfig.intervalMs) return true;

  const elapsedHours = (elapsedMs / (1000 * 60 * 60)).toFixed(1);
  const remainingHours = ((targetConfig.intervalMs - elapsedMs) / (1000 * 60 * 60)).toFixed(1);

  console.log(`\n[Daily Schedule] ${targetConfig.name} is configured for daily pings (every 24h).`);
  console.log(`                 Last pinged ${elapsedHours}h ago. Next ping in ~${remainingHours}h. Skipping for this cycle.`);
  return false;
}

/**
 * Record a ping result to `pings.json` database file and push to GitHub live dashboard.
 * @param {object} pingRecord 
 */
function recordPingToHistory(pingRecord) {
  const pingsFilePath = path.join(process.cwd(), 'pings.json');
  let history = [];

  try {
    if (fs.existsSync(pingsFilePath)) {
      const rawData = fs.readFileSync(pingsFilePath, 'utf8');
      history = JSON.parse(rawData);
    }
  } catch (err) {
    history = [];
  }

  history.push(pingRecord);

  // Maintain up to 1000 historical pings
  if (history.length > 1000) {
    history = history.slice(-1000);
  }

  try {
    fs.writeFileSync(pingsFilePath, JSON.stringify(history, null, 2), 'utf8');
    console.log(`[History] Logged ping #${history.length} (${pingRecord.targetName}) to pings.json`);

    // Sync to GitHub on every 5-min ping with pull rebase to prevent push rejections
    if (!IS_SINGLE_SHOT && !IS_LOOP_MODE) {
      try {
        const token = process.env.GITHUB_TOKEN;
        if (token) {
          execSync('git config --global user.name "github-actions[bot]"');
          execSync('git config --global user.email "github-actions[bot]@users.noreply.github.com"');
          execSync('git add pings.json');
          execSync('git commit -m "Auto-log ping history [skip ci]" || true');
          execSync('git pull --rebase origin main || true');
          execSync('git push origin main || true');
          console.log('⚡ [Live Sync] Successfully pushed ping log to GitHub Pages dashboard!');
        }
      } catch (gitErr) {
        console.warn('[Live Sync Warning] Git push skipped:', gitErr.message);
      }
    }
  } catch (err) {
    console.error('[History Warning] Failed to write to pings.json:', err.message);
  }
}

/**
 * Helper function to execute a single ping attempt for a given target.
 * @param {object} targetConfig - Target object { name, url, headers }
 * @param {number} attemptNumber - Current attempt number (1-indexed)
 * @returns {Promise<{ success: boolean, status: number | null, duration: number, error: Error | null }>}
 */
async function sendPing(targetConfig, attemptNumber) {
  const timestamp = getFormattedTimestamp();
  const startTime = performance.now();

  console.log(`\n--- [Attempt ${attemptNumber}] Ping request to ${targetConfig.name} (${targetConfig.url}) ---`);
  console.log(`Timestamp     : ${timestamp}`);

  try {
    const response = await fetch(targetConfig.url, {
      method: 'GET',
      headers: targetConfig.headers
    });

    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    // For keep-alive, 200-299 is OK; 401 Unauthorized for Supabase endpoint confirms project server is awake
    const isSuccess = response.ok || response.status === 401;

    console.log(`HTTP Status   : ${response.status} ${response.statusText}`);
    console.log(`Response Time : ${duration} ms`);
    console.log(`Result        : ${isSuccess ? 'SUCCESS' : 'FAILED (Non-2xx Status)'}`);

    const record = {
      id: `ping-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp,
      status: response.status,
      statusText: response.statusText,
      responseTimeMs: duration,
      success: isSuccess,
      targetUrl: targetConfig.url,
      targetName: targetConfig.name
    };

    recordPingToHistory(record);

    return {
      success: isSuccess,
      status: response.status,
      duration,
      error: isSuccess ? null : new Error(`HTTP ${response.status} ${response.statusText}`)
    };
  } catch (error) {
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);

    console.log(`HTTP Status   : N/A (Network / Request Error)`);
    console.log(`Response Time : ${duration} ms`);
    console.log(`Result        : FAILED (${error.message})`);

    const record = {
      id: `ping-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp,
      status: null,
      statusText: 'ERR',
      responseTimeMs: duration,
      success: false,
      targetUrl: targetConfig.url,
      targetName: targetConfig.name,
      error: error.message
    };

    recordPingToHistory(record);

    return {
      success: false,
      status: null,
      duration,
      error
    };
  }
}

/**
 * Run a full ping cycle across all targets with retry attempts.
 * Respects per-target ping intervals (Render every 5 min, Supabase once daily).
 * @returns {Promise<boolean>} True if all active targets succeeded.
 */
async function runPingCycle() {
  let overallSuccess = true;

  for (const targetConfig of TARGET_URLS) {
    if (!shouldPingTarget(targetConfig)) {
      continue;
    }

    let targetSuccess = false;

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
      const result = await sendPing(targetConfig, attempt);

      if (result.success) {
        console.log(` STATUS: SUCCESS - Target ${targetConfig.name} is active!`);
        targetSuccess = true;
        break;
      }

      if (attempt <= MAX_RETRIES) {
        console.log(`[Retry Warning] Request failed for ${targetConfig.name}. Retrying in ${RETRY_DELAY_MS / 1000}s... (${attempt}/${MAX_RETRIES} retries used)`);
        await setTimeout(RETRY_DELAY_MS);
      }
    }

    if (!targetSuccess) {
      console.error(` STATUS: FAILED - Target ${targetConfig.name} failed all retries.`);
      overallSuccess = false;
    }
  }

  return overallSuccess;
}

/**
 * Main execution controller.
 */
async function main() {
  console.log('====================================================');
  console.log('  WEB SERVICE KEEP-ALIVE PINGER (Render & Supabase)');
  console.log('====================================================');
  TARGET_URLS.forEach((t, i) => {
    const freq = t.intervalMs > 0 ? `${t.intervalMs / (1000 * 60 * 60)} Hours (Daily)` : 'Every 5 Minutes';
    console.log(`Target #${i + 1}      : ${t.name} [Frequency: ${freq}] -> ${t.url}`);
  });
  console.log(`Max Retries      : ${MAX_RETRIES}`);
  console.log(`Cycle Interval   : EVERY 5 MINUTES`);
  console.log(`Session Window   : 5.8 HOURS (350 MINUTES)`);
  console.log('====================================================');

  if (IS_SINGLE_SHOT) {
    const success = await runPingCycle();
    process.exit(success ? 0 : 1);
  } else if (IS_LOOP_MODE) {
    console.log('[Info] Running continuously locally. Press Ctrl+C to stop.\n');
    await runPingCycle();
    while (true) {
      console.log(`\n[Timer] Next cycle scheduled in 5 minutes (${new Date(Date.now() + PING_INTERVAL_MS).toLocaleTimeString()})...`);
      await setTimeout(PING_INTERVAL_MS);
      await runPingCycle();
    }
  } else {
    // GitHub Actions Long Session Mode: Runs for 5.8 hours, checking targets EVERY 5 MINUTES
    const sessionStartTime = Date.now();
    let cycleCount = 0;
    let anyFailure = false;

    while (Date.now() - sessionStartTime <= TOTAL_SESSION_DURATION_MS) {
      cycleCount++;
      const nowStr = new Date().toLocaleTimeString();
      console.log(`\n>>> [Ping Cycle #${cycleCount} at ${nowStr}] <<<`);
      const success = await runPingCycle();

      if (!success) {
        anyFailure = true;
      }

      const elapsed = Date.now() - sessionStartTime;
      const remaining = TOTAL_SESSION_DURATION_MS - elapsed;

      if (remaining >= PING_INTERVAL_MS) {
        console.log(`\n[Timer] Waiting 5 minutes until next cycle... (${Math.round(remaining / 60000)} min remaining in this GitHub Actions job)`);
        await setTimeout(PING_INTERVAL_MS);
      } else {
        break;
      }
    }

    console.log('\n====================================================');
    console.log(` GITHUB JOB SESSION COMPLETE - Executed ${cycleCount} cycles across 5.8 hours.`);
    console.log('====================================================');

    process.exit(anyFailure ? 1 : 0);
  }
}

main().catch((err) => {
  console.error('\n[Unhandled Exception]', err);
  process.exit(1);
});