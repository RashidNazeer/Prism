import { WurxMark } from '@/components/brand/WurxMark';
import { Container } from '@/components/layout/Section';

export function SiteFooter() {
  return (
    <footer className="border-t border-line py-12">
      <Container>
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <WurxMark />
            <p className="mt-4 text-sm leading-relaxed text-faint">
              The creator platform behind Wurx Media&rsquo;s TikTok Shop brands.
            </p>
          </div>

          <nav className="flex gap-14 text-sm" aria-label="Footer">
            <div>
              <h2 className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">
                Platform
              </h2>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <a href="#how" className="text-muted transition-colors hover:text-accent">
                    How it works
                  </a>
                </li>
                <li>
                  <a href="#platform" className="text-muted transition-colors hover:text-accent">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#apply" className="text-muted transition-colors hover:text-accent">
                    Apply
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">
                Company
              </h2>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <a
                    href="https://wurxmedia.com"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-muted transition-colors hover:text-accent"
                  >
                    Wurx Media
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-7 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Wurx Media. All rights reserved.</p>
          <p className="font-mono tracking-wider">WURXMEDIAHUB</p>
        </div>
      </Container>
    </footer>
  );
}
