import { LegalPage } from '@/routes/legal/LegalPage';
import { CONTACT_EMAIL, LEGAL_NAME, LEGAL_UPDATED, PRODUCT_NAME } from '@/routes/legal/legal-contact';

/**
 * What connecting a TikTok account does, readable WITHOUT SIGNING IN.
 *
 * WHY IT EXISTS. The Display API app was rejected on 2026-09-01 with "App will
 * not be approved for personal or company internal use." Two of TikTok's own
 * written requirements sat behind that verdict, and this page answers the
 * second one: "Your website URL cannot be a landing page or login page. You
 * must have an externally facing fully developed website." The URL on the
 * submission was the marketing page, and nothing anywhere on the signed-out
 * site described the feature being applied for. A reviewer could see that we
 * sell a creator platform; they could not see the thing they were reviewing.
 *
 * WHO IT IS FOR, in this order: a creator deciding whether to trust us with
 * their account, and a reviewer checking that we describe our own use honestly.
 * Both are served by the same plain answer, which is why this is one page and
 * not a marketing page plus a compliance page.
 *
 * EVERY CLAIM HERE IS CHECKED AGAINST THE CODE. In particular it says the
 * figures are visible to the creator AND to our staff, because
 * `creator_tiktok_videos` carries a staff SELECT policy as well as an own-row
 * one. "Only you can see them" would read better and would be false, and
 * describing LESS access than we take is the thing a reviewer is looking for.
 */
export function TikTokConnection() {
  return (
    <LegalPage title="Connecting your TikTok account" updated={LEGAL_UPDATED}>
      <p>
        {PRODUCT_NAME} is a platform for independent TikTok Shop creators. If you are approved,
        you can choose to connect your own TikTok account so that your video results appear
        alongside the rest of your numbers. This page explains exactly what that does, before you
        decide.
      </p>
      <p>
        <strong>Connecting is optional.</strong> Nothing else on the platform depends on it. You
        can use your account, take offers, submit videos and be paid without ever connecting.
      </p>

      <h2>Whose account it is</h2>
      <p>
        Yours. You own and run your own TikTok account, and {LEGAL_NAME} does not operate, manage
        or post from any creator&rsquo;s account. Connecting is something you do yourself, from
        your own profile page, by signing in to TikTok and granting permission there. We never
        ask for your TikTok password, and we could not use it if you gave it to us.
      </p>

      <h2>What we read</h2>
      <p>We ask TikTok for two permissions, and nothing else:</p>
      <ul>
        <li>
          <strong>Your basic profile</strong> &mdash; your display name and profile picture, so we
          can show you which account you connected and you can confirm it is the right one.
        </li>
        <li>
          <strong>Your list of videos</strong> &mdash; your own public videos, with the views,
          likes, comments and shares on each, so you can see how your posts performed.
        </li>
      </ul>
      <p>
        We only ever read your own account. We never read another person&rsquo;s videos, and we
        never post, edit, schedule or delete anything on TikTok. There is no permission in our
        app that would let us.
      </p>

      <h2>Who can see the figures</h2>
      <p>
        You can, on your own profile page. {LEGAL_NAME} staff can also see them, because they
        support you and answer questions about your numbers. They are not shown to other
        creators, they are not published on any public page, and they are not shown on any other
        website.
      </p>
      <p>
        These figures are not the same as the sales figures elsewhere in the platform, and the
        page says so where they appear: one is what a video did on TikTok, the other is what it
        sold. They are different measures and they will not reconcile.
      </p>

      <h2>Disconnecting</h2>
      <p>
        There is a Disconnect button on the same screen you connected from. Using it tells TikTok
        to revoke our access and deletes the stored figures from our side. You can reconnect
        later if you want to, and you do not have to ask us.
      </p>

      <h2>Questions</h2>
      <p>
        Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and a person will answer.
        What we hold and why is set out in full in our <a href="/privacy">Privacy Policy</a>, and
        the terms you work under are in our <a href="/terms">Terms of Service</a>.
      </p>
    </LegalPage>
  );
}
