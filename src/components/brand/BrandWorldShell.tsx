import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { m } from 'motion/react';
import { ArrowLeft, LogOut, Menu, X } from 'lucide-react';
import { PrismMark } from '@/components/brand/PrismMark';
import { useTheme } from '@/components/theme/theme-context';
import {
  contrast,
  deriveBrandTheme,
  paletteToVars,
  readBrandThemeConfig,
  DEFAULT_BRAND_COLOR,
} from '@/lib/brand-theme';
import type { CreatorBrand } from '@/lib/creator/useCreatorBrands';
import { cn } from '@/lib/utils';

/**
 * THE BRAND WORLD, and the point of it is that it does not look like Wurx.
 *
 * Rashid: "take him to a new world ... user will land in new world in full
 * screen all menu items will be hidden ... these tabs will be the new menu on
 * left side so users can navigate to different brand hub from tabs and all
 * offers, overview contest my numbers, for selected brands, would be the menu
 * on left side."
 *
 * So the Wurx sidebar and top bar are gone, and the rail here carries two
 * lists: the brands a creator works with, and the sections of whichever one is
 * open. Choosing a brand and choosing a section are the same gesture in the
 * same place, which is what makes it feel like moving around one world rather
 * than reloading a page.
 *
 * EVERY COLOUR COMES OUT OF THE DATABASE, and from 2026-08-25 there can be
 * several: an admin colours the hero, the menu, the pages and the buttons
 * independently, up to four colours each, and every one of those is a FILL.
 * `deriveBrandTheme` turns them into a full palette for both modes and picks
 * each text colour by MEASURING contrast against every fill it will cross, so
 * there is no combination an admin can choose that makes this unreadable.
 *
 * The variables are set on this element rather than on `:root`, so the world is
 * scoped: nothing leaks out to the rest of the app, and leaving the route is
 * enough to undo it.
 *
 * IT STILL RESPECTS THE THEME TOGGLE. Rashid kept the standing rule that dark
 * and light are equal citizens, so a brand has a dark face and a light face
 * rather than one fixed look. A creator working at night stays in the dark.
 */

export type WorldSection = {
  key: string;
  label: string;
  soon?: string;
};

export function BrandWorldShell({
  brand,
  brands,
  sections,
  section,
  onSection,
  children,
}: {
  brand: CreatorBrand;
  brands: CreatorBrand[];
  sections: readonly WorldSection[];
  section: string;
  onSection: (key: string) => void;
  children: React.ReactNode;
}) {
  const { resolved } = useTheme();
  const navigate = useNavigate();
  const [railOpen, setRailOpen] = useState(false);

  /*
   * ONE COLOUR, PLUS WHATEVER AN ADMIN COLOURED BY HAND.
   *
   * `readBrandThemeConfig` rather than the raw column, because `theme` is jsonb
   * and therefore whatever the row happens to hold. A brand nobody has
   * customised reads back as null and derives exactly as it always did.
   *
   * Memoised on the values it depends on. It is pure maths, but it is a few
   * hundred contrast measurements, and without this it would run again on every
   * render of the entire world, including every keystroke inside it.
   */
  const vars = useMemo(() => {
    const theme = deriveBrandTheme(
      brand.brand_color ?? DEFAULT_BRAND_COLOR,
      readBrandThemeConfig(brand.theme)
    );
    return paletteToVars(resolved === 'dark' ? theme.dark : theme.light);
  }, [brand.brand_color, brand.theme, resolved]);

  /*
   * THE WORLD OWNS THE WHOLE PAGE while it is open, so the body must not sit on
   * the Wurx background behind it. Undone on the way out, or every screen after
   * this one keeps the brand's page colour.
   */
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = vars['--wx-brand-page'] ?? '';
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, [vars]);

  // A brand change on a phone should not leave the drawer sitting open over it.
  useEffect(() => {
    setRailOpen(false);
  }, [brand.slug, section]);

  /*
   * IS THE MENU PALE? Only the Wurx mark needs to know, and it cannot ask the
   * palette directly because by this point the rail is a CSS variable rather
   * than a value. Measured off the computed hairline instead: the rail edge is
   * mixed from the rail's own text colour, so a light text colour means a deep
   * rail and a dark one means a pale rail.
   */
  const paleRail = contrast(vars['--wx-brand-rail-text'] ?? '#ffffff', '#ffffff') > 2;

  const rail = (
    <div
      className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5"
      // The rail is USUALLY dark, in both modes, so the mark keeps its own
      // colours rather than the light theme's darkening filter, which would
      // render it nearly black on a deep brand background. A brand that chose a
      // pale menu is the exception, and there the filter has to come back or
      // the mark is a white shape on a pale ground.
      style={{ ['--wx-mark-filter' as string]: paleRail ? '' : 'none' }}
    >
      {/* ----------------------------------------------- the way back out -- */}
      {/*
        A SLIM WURX STRIP, kept deliberately quiet. The world belongs to the
        brand, but a creator must never feel they have left the product and
        cannot get home. Rashid picked this over hiding the exit in a menu.
      */}
      <div className="flex items-center justify-between gap-2 px-1">
        <Link
          to="/app"
          className="flex items-center gap-2 rounded-md px-1.5 py-1 opacity-80 transition hover:opacity-100 focus-visible:outline-2"
          style={{ color: 'var(--wx-brand-rail-text)' }}
        >
          <PrismMark className="h-5 w-auto" />
        </Link>
        <Link
          to="/app"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.75rem] font-semibold transition hover:opacity-100"
          style={{ color: 'var(--wx-brand-rail-muted)' }}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Leave
        </Link>
      </div>

      {/* --------------------------------------------------- the brands -- */}
      <nav aria-label="Your brands">
        <RailLabel>Your brands</RailLabel>
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {brands.map((b) => {
            const active = b.slug === brand.slug;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/app/brands/${b.slug}`)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition',
                    !active && 'hover:opacity-100'
                  )}
                  style={{
                    background: active ? 'var(--wx-brand-rail-active)' : 'transparent',
                    color: active ? 'var(--wx-brand-rail-text)' : 'var(--wx-brand-rail-muted)',
                  }}
                >
                  <BrandChip brand={b} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-semibold">
                      {b.name}
                    </span>
                    {b.tagline ? (
                      <span
                        className="block truncate text-[0.6875rem]"
                        style={{ color: 'var(--wx-brand-rail-muted)' }}
                      >
                        {b.tagline}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* -------------------------------------------------- the sections -- */}
      <nav aria-label={`${brand.name} sections`}>
        <RailLabel>{brand.name}</RailLabel>
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {sections.map((s) => {
            const active = s.key === section;
            const locked = Boolean(s.soon);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => !locked && onSection(s.key)}
                  aria-current={active ? 'page' : undefined}
                  title={locked ? `${s.label} arrives with ${s.soon}` : undefined}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] font-semibold transition',
                    locked && 'cursor-default'
                  )}
                  style={{
                    background: active ? 'var(--wx-brand-rail-active)' : 'transparent',
                    color: active
                      ? 'var(--wx-brand-rail-text)'
                      : locked
                        ? 'var(--wx-brand-rail-muted)'
                        : 'var(--wx-brand-rail-muted)',
                    opacity: locked ? 0.55 : 1,
                  }}
                >
                  <span className="truncate">{s.label}</span>
                  {locked ? (
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[0.5625rem] tracking-wider uppercase opacity-70">
                      {s.soon}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );

  return (
    <div
      style={vars as React.CSSProperties}
      className="flex min-h-screen w-full"
      data-brand-world={brand.slug}
    >
      {/* ------------------------------------------- the rail, on a laptop -- */}
      <aside
        className="hidden w-[16.5rem] shrink-0 border-r lg:block"
        style={{
          background: 'var(--wx-brand-rail-wash)',
          borderColor: 'var(--wx-brand-rail-edge)',
        }}
      >
        <div className="sticky top-0 h-screen">{rail}</div>
      </aside>

      {/* ----------------------------------------- the rail, as a drawer -- */}
      {/*
        NOT `display:none` below the breakpoint, which is how the rest of the
        product would have lost the brand switcher entirely on a phone. Creators
        are mostly on phones, and the switcher is the whole navigation here.
      */}
      {railOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close the menu"
            onClick={() => setRailOpen(false)}
            className="absolute inset-0 bg-black/55"
          />
          <m.aside
            initial={{ x: -24, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] border-r shadow-2xl"
            style={{
              background: 'var(--wx-brand-rail-wash)',
              borderColor: 'var(--wx-brand-rail-edge)',
            }}
          >
            <button
              type="button"
              onClick={() => setRailOpen(false)}
              aria-label="Close the menu"
              className="absolute top-4 right-3 rounded-full p-1.5"
              style={{ color: 'var(--wx-brand-rail-muted)' }}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            {rail}
          </m.aside>
        </div>
      ) : null}

      {/* ----------------------------------------------------- the world -- */}
      <div
        className="flex min-w-0 flex-1 flex-col"
        style={{ background: 'var(--wx-brand-page-wash)', color: 'var(--wx-brand-text)' }}
      >
        {/* The phone bar: the only Wurx-shaped chrome left, and it is one button. */}
        <div
          className="sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-2.5 backdrop-blur lg:hidden"
          style={{
            background: 'color-mix(in srgb, var(--wx-brand-page) 88%, transparent)',
            borderColor: 'var(--wx-brand-line)',
          }}
        >
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            aria-label="Open the menu"
            className="wx-neo-raised-sm wx-neo-press grid size-11 shrink-0 place-items-center rounded-full"
            style={{ color: 'var(--wx-brand-text)' }}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <BrandChip brand={brand} />
          <span className="min-w-0 flex-1 truncate text-[0.875rem] font-semibold">
            {brand.name}
          </span>
          <Link
            to="/app"
            aria-label="Leave this brand"
            className="wx-neo-raised-sm wx-neo-press grid size-11 shrink-0 place-items-center rounded-full"
            style={{ color: 'var(--wx-brand-muted)' }}
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {children}
      </div>
    </div>
  );
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-2 text-[0.625rem] font-bold tracking-[0.14em] uppercase"
      style={{ color: 'var(--wx-brand-rail-muted)', opacity: 0.75 }}
    >
      {children}
    </div>
  );
}

/** A brand's logo, or its initial on a tinted square when it has none. */
export function BrandChip({ brand, size = 28 }: { brand: CreatorBrand; size?: number }) {
  const style = { width: size, height: size };
  if (brand.logo_url) {
    return (
      <img
        src={brand.logo_url}
        alt=""
        style={style}
        className="shrink-0 rounded-lg object-cover"
        loading="lazy"
      />
    );
  }
  return (
    <span
      style={{
        ...style,
        background: 'color-mix(in srgb, var(--wx-brand-accent) 30%, transparent)',
        color: 'var(--wx-brand-rail-text)',
      }}
      className="grid shrink-0 place-items-center rounded-lg text-[0.75rem] font-bold"
      aria-hidden
    >
      {brand.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
