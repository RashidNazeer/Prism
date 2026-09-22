import { LegalPage } from '@/routes/legal/LegalPage';
import {
  CONTACT_EMAIL,
  LEGAL_ADDRESS,
  LEGAL_NAME,
  LEGAL_UPDATED,
  PRODUCT_NAME,
} from '@/routes/legal/legal-contact';

/**
 * The terms a creator works under.
 *
 * WRITTEN FROM WHAT THE PRODUCT ACTUALLY DOES, not from a template. Every
 * clause below describes something that exists in this repo: the application
 * and approval flow, the three kinds of offer, the seven stages an approved
 * offer moves through, samples, contests, and the fact that both figures on an
 * offer freeze the moment somebody is approved for it.
 *
 * THIS IS A DRAFT AND RASHID MUST READ IT. It is accurate about the mechanics,
 * which is the part I can be sure of; it is not legal advice and nobody
 * qualified has reviewed it. The clauses most worth his attention are the ones
 * about WHEN people get paid and WHAT LICENCE we take over a creator's video,
 * because those are commercial decisions rather than descriptions, and I have
 * written what the product implies rather than what he has agreed.
 */
export function Terms() {
  return (
    <LegalPage title="Terms of Service" updated={LEGAL_UPDATED}>
      <p>
        These terms cover your use of {PRODUCT_NAME}, the platform {LEGAL_NAME} runs for
        independent creators who take paid work from our TikTok Shop brands. Applications are
        open: any creator who meets the conditions in &ldquo;Who can use it&rdquo; below can
        apply. By applying for an account, or by using one, you agree to them. If you do not
        agree, do not use the platform.
      </p>

      <h2>What this platform is</h2>
      <p>
        {PRODUCT_NAME} is a platform for independent TikTok Shop creators. Anyone can apply from
        our home page: there is no follower minimum, and a person reads every application.{' '}
        {LEGAL_NAME} works with a number of brands that sell on TikTok Shop, and approved
        creators use this platform to see the paid work those brands have available, to take it
        on, to submit the videos they post, to follow their own sales and commission, and to be
        paid.
      </p>
      <p>
        Creators are independent. You own and run your own TikTok account, and {LEGAL_NAME} does
        not operate, manage or post from any creator&rsquo;s account.
      </p>
      <p>
        Access is by approval. Having an account does not entitle you to any particular offer,
        and an offer being visible to you does not oblige us to approve you for it.
      </p>

      <h2>Who can use it</h2>
      <ul>
        <li>You must be at least 18 years old.</li>
        <li>
          You must have your own TikTok account in good standing and be eligible to post
          commercial content on it under TikTok&rsquo;s own rules.
        </li>
        <li>
          You must give us accurate information when you apply, and keep it up to date. We
          approve people partly on what they tell us, so this matters.
        </li>
        <li>
          The account is yours alone. Do not share your sign-in details, and tell us promptly if
          you think somebody else has them.
        </li>
      </ul>

      <h2>Offers, and what you are agreeing to</h2>
      <p>
        An offer describes a piece of paid work: usually a number of videos and a fee, sometimes
        a commission rate instead, and sometimes both. Some offers are open to everybody with
        access to that brand; others you apply for and we approve.
      </p>
      <p>
        <strong>The terms of an offer freeze when you are approved for it.</strong> The number of
        videos and the amount you will be paid are recorded against you at that moment. If we
        later change the offer, that change applies to whoever is approved next, not to you. What
        the platform shows you after approval is your agreement, not the current advert.
      </p>
      <p>
        Approved work moves through clear stages, which you can see at any time: your request, a
        sample requested, a sample shipped, your content pending, your content completed, payment
        pending, and paid.
      </p>

      <h2>Samples</h2>
      <p>
        Some offers include a product sample. A sample is provided so that you can make the
        content the offer describes. Unless we tell you otherwise in writing, the sample is yours
        to keep. If you do not deliver the content the offer describes, we may decline to send
        further samples and may not approve you for further work.
      </p>

      <h2>Your content</h2>
      <p>
        <strong>The videos you make are yours.</strong> You keep ownership of everything you post
        to your own TikTok account. You are the one posting it and you remain responsible for it.
      </p>
      <p>
        By submitting a video to a campaign on this platform, you grant {LEGAL_NAME} and the
        brand the offer belongs to a non-exclusive, royalty-free licence to view, reference and
        report on that video for the purposes of running the campaign, verifying delivery and
        calculating what you are owed. Any use beyond that &mdash; for example a brand reusing
        your video in its own paid advertising &mdash; is only permitted where the offer says so
        or where you have separately agreed to it.
      </p>
      <p>You are responsible for making sure your content:</p>
      <ul>
        <li>
          <strong>Clearly discloses that it is a paid partnership</strong>, in whatever way the
          law where you live requires and TikTok&rsquo;s own rules require. In the US that means
          the FTC&rsquo;s endorsement guidance; in the UK it means the ASA&rsquo;s.
        </li>
        <li>Follows TikTok&rsquo;s Community Guidelines, Terms of Service and commercial policies.</li>
        <li>Is your own work, and does not use music, footage or images you have no right to use.</li>
        <li>Makes no claim about a product that the brand has not given you.</li>
      </ul>
      <p>
        We may decline to approve a submitted video that does not meet the offer, does not follow
        these rules, or is not genuinely about the product. Where we decline one, we will tell you
        why.
      </p>

      <h2>Getting paid</h2>
      <p>
        What you are owed for an offer is the amount recorded when you were approved, once the
        work described has been delivered and approved. Commission, where an offer pays it,
        follows the sales the brand actually records through TikTok Shop.
      </p>
      <p>
        We show you where your money has got to, and payment is made through the method agreed
        with you. You are responsible for your own taxes: nothing here makes us your employer, and
        we do not deduct tax on your behalf.
      </p>
      <p>
        Figures shown on the platform come from TikTok and from the brands we work with. We show
        you the same numbers we work from and correct them when the source corrects them, which
        does sometimes happen after a day has closed. We do not guarantee that a figure will never
        be restated.
      </p>

      <h2>Contests</h2>
      <p>
        Where we run a contest, the contest itself says what counts, what the target is, what the
        reward is and when it closes. Those specific terms apply on top of these, and where the
        two disagree the contest&rsquo;s own terms win. Progress you enter yourself is confirmed
        by us before a reward is settled.
      </p>

      <h2>What you must not do</h2>
      <ul>
        <li>
          Inflate results by artificial means: bought views, engagement pods, bots, or any method
          TikTok itself prohibits.
        </li>
        <li>Misrepresent who you are, or use somebody else&rsquo;s account or content.</li>
        <li>
          Try to reach data that is not yours, whether another creator&rsquo;s figures or a
          brand&rsquo;s commercial information.
        </li>
        <li>Interfere with the platform, or attempt to circumvent its access controls.</li>
      </ul>

      <h2>Suspending or closing an account</h2>
      <p>
        You may stop using the platform at any time and ask us to close your account. We may
        suspend or close an account that breaks these terms, and we may withhold payment for work
        obtained or delivered in breach of them. Where we do either, we will tell you what
        happened. Closing your account does not remove our obligation to pay you for work you
        have properly delivered.
      </p>

      <h2>This is not employment</h2>
      <p>
        You are an independent creator, not an employee, worker, agent or partner of{' '}
        {LEGAL_NAME}. Nothing on this platform creates any of those relationships. You decide
        when and how you work, and you may work with anybody else.
      </p>

      <h2>TikTok is not part of this agreement</h2>
      <p>
        This platform uses TikTok&rsquo;s APIs, and you may choose to connect your own TikTok
        account to it. TikTok is not a party to these terms, does not sponsor or endorse this
        platform, and is not responsible for it. Your use of TikTok itself is governed by
        TikTok&rsquo;s own terms.
      </p>

      <h2>What we do not promise</h2>
      <p>
        We work hard to keep the platform accurate and available, but we provide it as it is. We
        do not promise that it will be uninterrupted, that every figure will always be current, or
        that any particular amount of work or income will be available to you. To the extent the
        law allows, {LEGAL_NAME} is not liable for indirect or consequential loss, and our total
        liability to you is limited to the amounts payable to you for work you have delivered.
      </p>
      <p>Nothing here limits any liability that cannot lawfully be limited.</p>

      <h2>Changes</h2>
      <p>
        We may update these terms. Where a change matters to you, we will tell you before it takes
        effect. Continuing to use the platform after that means you accept the new version. The
        date at the top of this page is when it last changed.
      </p>

      <h2>Getting in touch</h2>
      <p>
        Questions about these terms, or about anything on the platform, go to{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <p>
        These terms are between you and {LEGAL_NAME}, {LEGAL_ADDRESS}.
      </p>
    </LegalPage>
  );
}
