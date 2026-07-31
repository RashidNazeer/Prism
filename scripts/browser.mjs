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
