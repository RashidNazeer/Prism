import { LegalPage } from '@/routes/legal/LegalPage';
import { CONTACT_EMAIL, LEGAL_NAME, LEGAL_UPDATED, PRODUCT_NAME } from '@/routes/legal/legal-contact';

/**
 * What we hold about a person, and what we do with it.
 *
 * WRITTEN FROM AN ACTUAL INVENTORY OF THE CODE, not from a template. Four
 * readers went through the migrations, the Edge Functions, the storage buckets
 * and the third-party surface on 2026-08-26 and the result was reconciled
 * against this text, so every category below is something this repo really
 * stores and every third party below really receives something.
 *
 * THE RULE THAT KEEPS IT HONEST: this page may only claim things the code
 * enforces. It deliberately does NOT promise a retention period that nothing
 * deletes, and it does not claim we avoid collecting something we in fact
 * collect. An overclaiming privacy policy is worse than a modest one, because
 * the first is a false statement and the second is merely short.
 *
 * TWO SECTIONS DESCRIBE SOMETHING NOT YET BUILT, and both say so plainly: the
 * creator TikTok connection. They are here because the TikTok app review needs
 * the policy to cover the integration being reviewed, and writing them
 * afterwards would mean submitting a policy that does not describe the thing
 * being submitted. Remove the "not yet available" wording on the day it ships.
 */
export function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated={LEGAL_UPDATED}>
      <p>
        This explains what {LEGAL_NAME} collects about you when you use {PRODUCT_NAME}, why we
        collect it, who can see it and what you can do about it. It is written to be read rather
        than to be skipped.
      </p>
      <p>
        {LEGAL_NAME} is the controller of this information. If you want to reach a person about
        any of it, write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <p>
        <strong>This covers you whether or not we approved you.</strong> If you applied and we
        said no, we still hold what you sent us, and everything below applies to you exactly as it
        applies to an approved creator &mdash; including your right to ask us to delete it.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>
          We hold what you tell us when you apply, the work you do with us, and the money that
          work earns.
        </li>
        <li>
          <strong>We do not sell your information, and we do not run advertising trackers or
          analytics on this platform.</strong>
        </li>
        <li>
          <strong>Other creators can see your leaderboard figures</strong> &mdash; your name, your
          picture and your totals for a period. They cannot see your email, what any single offer
          pays you, or anything broken down video by video.
        </li>
        <li>
          If you connect your TikTok account, you can disconnect it at any time, and we only ever
          read your own account.
        </li>
      </ul>

      <h2>What we hold, and why</h2>

      <h3>Who you are</h3>
      <p>
        Your name, your email address and your TikTok handle. That is the whole of it: we do not
        ask for or hold a phone number, a postal address, a date of birth or a legal name.
      </p>
      <p>
        Your handle is what you typed. We do not check it against TikTok, so it is yours to
        correct at any time from your profile.
      </p>

      <h3>What you told us when you applied</h3>
      <p>
        The kind of content you make, links to your own videos, whether you had worked with Wurx
        before, and the note our reviewer wrote when deciding. We use it to decide whether to
        approve you, and we keep it so we know why a decision was made.
      </p>

      <h3>The work you do</h3>
      <p>
        The offers you ask for and are approved for, the terms agreed with you at that moment, the
        videos you submit to a campaign, and where each piece of work has reached. We need this to
        run the work and to know what you are owed.
      </p>

      <h3>Your money</h3>
      <p>
        What each piece of work pays, the commission your videos earn, and the sales and
        advertising figures TikTok reports for the videos you posted. This is the heart of the
        product: showing you your own real numbers is the reason it exists.
      </p>
      <p>
        Those figures come from the brand&rsquo;s own TikTok advertising account, which the brand
        authorises us to read. They are about the videos, not about you: we never send TikTok your
        name, your email or your handle in order to get them.
      </p>

      <h3>Your picture</h3>
      <p>
        We fetch your profile picture once, from a public avatar service called unavatar.io, using
        the TikTok handle you gave us. We then keep our own copy so that your handle is not sent
        anywhere every time your picture is shown. It is used inside the platform to tell people
        apart, and it appears beside your name on leaderboards, where other signed-in creators can
        see it.
      </p>

      <h3>Your TikTok account, if you connect it</h3>
      <p>
        <strong>This is not available yet and this section describes what it will do when it
        is.</strong> If you choose to connect your own TikTok account, we receive an access token
        and your basic TikTok profile, and we read the list of your own public videos together
        with their view, like, comment and share counts. We use those figures to show you how the
        videos you submitted performed.
      </p>
      <ul>
        <li>Connecting is your choice, and nothing else on the platform depends on it.</li>
        <li>We only ever read <strong>your own</strong> account. We never read anybody else&rsquo;s.</li>
        <li>
          We never post, edit or delete anything on TikTok. The connection is read-only, and the
          permission we ask for cannot do those things.
        </li>
        <li>
          You can disconnect from the same screen you connected on. When you do, we delete the
          token and stop reading anything.
        </li>
      </ul>

      <h3>What happens on the platform</h3>
      <p>
        We keep a record of significant actions, so that a decision about you can be traced back
        to whoever made it. That covers our own staff &mdash; approving somebody, changing what an
        offer pays, reviewing a video &mdash; and it also covers things <strong>you</strong> do
        that change money or standing: entering a contest, submitting work, asking for an offer or
        withdrawing from one.
      </p>
      <p>
        That record deliberately holds no IP address, no device and no location. It notes the
        account that acted and nothing about the machine it acted from. We also hold the ordinary
        technical information any website receives in order to serve you a page and keep you
        signed in.
      </p>

      <h2>What other creators can see about you</h2>
      <p>
        Leaderboards are part of the product and they are not anonymous. Every signed-in creator
        who can see a board can see, for each creator on it: their display name, their picture,
        and their totals for the period the board covers &mdash; sales, orders, videos and the ad
        spend behind them.
      </p>
      <p>They cannot see your email address, your application, what any individual offer pays
        you, your stage on a piece of work, or any figure broken down by video. Only creators who
        have figures appear at all.
      </p>
      <p>
        Where a contest asks you to set a private target for yourself, that target is deliberately
        kept out of every feed and every internal record, because the screen that asks for it
        promises nobody else sees it.
      </p>

      <h2>What we do not do</h2>
      <ul>
        <li>
          <strong>We do not sell your information</strong>, and we do not share it with anybody for
          their own marketing.
        </li>
        <li>
          <strong>There is no analytics or advertising tracker on this platform.</strong> No
          Google Analytics, no advertising pixel, no session recorder.
        </li>
        <li>
          We do not show one creator another creator&rsquo;s email address, application, offer
          terms or per-video figures, and we never show a creator a brand&rsquo;s budget or
          commercial terms. Leaderboard totals are the deliberate exception, described above.
        </li>
      </ul>

      <h2>Who else is involved</h2>
      <p>
        We use a small number of companies to run the platform. They only ever handle your
        information in order to provide their service to us.
      </p>
      <div className="wx-prose-table">
        <table>
          <thead>
            <tr>
              <th>Who</th>
              <th>What they do</th>
              <th>What they hold</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supabase</td>
              <td>Our database, sign-in and file storage</td>
              <td>Everything described above</td>
            </tr>
            <tr>
              <td>Vercel</td>
              <td>Hosts the website</td>
              <td>Ordinary web request information</td>
            </tr>
            <tr>
              <td>TikTok</td>
              <td>
                Provides the sales and advertising figures for our brands, and &mdash; if you
                connect your account &mdash; your own video figures
              </td>
              <td>
                The permissions you grant when you connect. When you submit a video link we also
                ask TikTok what that video is, which means sending TikTok the link you pasted
              </td>
            </tr>
            <tr>
              <td>unavatar.io</td>
              <td>Fetches your profile picture once, from your TikTok handle</td>
              <td>Your TikTok handle, at the moment we fetch the picture</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Two things happen in <strong>your own browser</strong> rather than on our servers, and
        they are worth saying out loud: video thumbnails are loaded from TikTok directly, and a
        video you play on the platform is played by TikTok&rsquo;s own embedded player. In both
        cases your browser talks to TikTok, and TikTok sees that request the way it sees any visit.
      </p>
      <p>
        Our staff can export lists of creators and results to a spreadsheet in order to do their
        work. Once a file is on somebody&rsquo;s computer it is outside the platform, and we
        handle those files under our own internal rules rather than under the controls described
        on this page.
      </p>
      <p>
        We may also disclose information where the law requires it, or to establish or defend a
        legal claim.
      </p>

      <h2>Who can see your information inside {LEGAL_NAME}</h2>
      <p>
        Access is enforced by the database itself rather than by hiding buttons. Your figures are
        readable by you and by {LEGAL_NAME} staff who need them to run the work and pay you.
        Brands see the results of campaigns they are paying for. Other creators do not see your
        earnings.
      </p>

      <h2>How long we keep it</h2>
      <p>
        <strong>We currently keep what we hold for as long as the platform runs.</strong> We have
        no automatic deletion, so we would rather tell you that than quote a schedule that does
        not exist. That includes applications we turned down: if you applied and we said no, your
        application and your profile picture stay with us until you ask us to remove them.
      </p>
      <p>
        Anything to do with payment we would in any case need to keep for the period our tax and
        accounting obligations require. The record of decisions is kept as a permanent history,
        and it keeps the email address of the staff member who acted even after that person has
        left, so that an old decision still makes sense.
      </p>
      <p>
        If you ask us to delete your account we will do it, keeping only what we are legally
        required to keep. Ask at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we
        will confirm when it is done.
      </p>

      <h2>Where it is held</h2>
      <p>
        The platform is hosted in the cloud and your information may be processed outside the
        country you live in, including in the United States. Where information about somebody in
        the UK or the EU is transferred, we rely on the safeguards our providers put in place for
        that purpose.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you can ask us to give you a copy of what we hold about you,
        correct it, delete it, or limit what we do with it. You can also object to some uses, and
        withdraw a permission you gave us &mdash; disconnecting your TikTok account is one of
        those. Ask at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will respond
        within the time the law allows.
      </p>
      <p>
        If you are in the UK you may complain to the Information Commissioner&rsquo;s Office; in
        the EU, to your national data protection authority.
      </p>

      <h2>Children</h2>
      <p>
        This platform is for people aged 18 and over. We do not knowingly collect information
        about children, and we will delete it if we find we have.
      </p>

      <h2>Security</h2>
      <p>
        Sign-in is handled by our authentication provider and we never see your password. Access
        is enforced by the database itself rather than by hiding things in the interface, so a
        mistake on a screen cannot hand somebody information the database would refuse them.
        Sensitive keys are held on our servers and never sent to your browser.
      </p>
      <p>
        No system is perfect. If something goes wrong that affects you, we will tell you and the
        relevant regulator where we are required to.
      </p>

      <h2>Changes</h2>
      <p>
        We will update this page when what we do changes, and the date at the top tells you when
        it last changed. Where a change matters to you, we will tell you rather than leaving you
        to find it.
      </p>

      <h2>Getting in touch</h2>
      <p>
        Any question about your information goes to{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, and a person will answer it.
      </p>
    </LegalPage>
  );
}
