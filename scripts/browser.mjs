import { chromium } from 'playwright';

/**
 * One place that launches Chromium for every suite.
 *
 * Rashid's machine has 7.4 GB of RAM, and VS Code plus a browser already sit on
 * most of it. A default Playwright launch on top of that pushed the machine
 * deep into its page file, and Windows answered by killing the VS Code
 * extension host mid-run: "the host unexpectedly terminated". From the outside
 * that looks exactly like Claude hanging, and clicking Stop does nothing,
 * because there is nothing left running to stop.
 *
 * These flags are about giving the tests a smaller footprint on a machine that
 * is doing other things. They do not change what is being tested: the same
 * pages, the same JavaScript, the same row level security.
 *
 * If a suite ever needs a real GPU or a shared memory heavy page, take the
 * flags off for that suite rather than for all of them.
 */
export function launchBrowser(options = {}) {
  const { args = [], ...rest } = options;
  return chromium.launch({
    args: [
      // Software rendering. There is nothing to look at in a headless run, and
      // the GPU process is pure overhead.
      '--disable-gpu',
      // Chromium's /dev/shm heuristics are wrong on Windows under pressure and
      // it starts allocating far more than it needs.
      '--disable-dev-shm-usage',
      // Background tabs, extensions, translation, crash reporting: none of it
      // is part of any assertion here.
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-renderer-backgrounding',
      '--no-first-run',
      '--no-default-browser-check',
      // A hard ceiling per renderer, so one runaway page cannot take the
      // machine with it.
      '--js-flags=--max-old-space-size=384',
      ...args,
    ],
    ...rest,
  });
}

/**
 * TURN "ALL TIME" ON, AND ONLY IF IT IS OFF.
 *
 * Every Paid Collabs screen opens on the CURRENT MONTH, which makes a suite's
 * result depend on the calendar: on 1 October 2026 three separate files started
 * failing — brands vanished from the Brands list because they had no creators
 * yet that month, status dividers were correctly absent because everybody was
 * in one state, and a GMV card read null. None of that is about what those
 * files check. All Time gives them a stable shape of data to assert on.
 *
 * IT IS A TOGGLE, AND THAT IS THE WHOLE REASON THIS IS A FUNCTION. The setting
 * persists between screens, so a suite that opens three brands and clicks the
 * button each time turns it ON, then OFF, then ON — and the brand in the middle
 * is quietly tested on the current month while the other two are not. That cost
 * an hour, reading as a single mysteriously-failing brand.
 *
 * Active state is read the way the button draws it: accent fill, white text.
 */
export async function ensureAllTime(page, { timeout = 15000 } = {}) {
  const btn = page.getByRole('button', { name: /^all time$/i }).first();
  if (!(await btn.count().catch(() => 0))) return false;
  const isOn = async () => {
    const color = await btn.evaluate((el) => getComputedStyle(el).color).catch(() => '');
    return /rgb\(255,\s*255,\s*255\)/.test(color);
  };
  if (await isOn()) return true;
  await btn.click().catch(() => {});
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await isOn()) { await page.waitForTimeout(1200); return true; }
    await page.waitForTimeout(250);
  }
  return false;
}
