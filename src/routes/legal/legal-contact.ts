/**
 * Who a creator writes to, and the name we trade under.
 *
 * ONE PLACE, because these appear on both legal pages and in the TikTok
 * developer app registration, and three copies of a support address is how one
 * of them ends up pointing at a mailbox nobody reads.
 *
 * RASHID MUST CONFIRM BOTH before these pages reach production:
 *
 * - `CONTACT_EMAIL` has to be a mailbox that actually exists and is actually
 *   read. An app reviewer may well send a message to it, and a creator asking
 *   to have their data deleted has a legal right to reach somebody. It is set
 *   to the obvious address on the company's own domain rather than to a
 *   personal one; if that mailbox does not exist, create it or change this.
 * - `LEGAL_NAME` should be the REGISTERED company name if Wurx Media trades
 *   under a fuller one. A privacy policy naming an entity that does not exist
 *   is worse than one naming none.
 */
export const CONTACT_EMAIL = 'support@wurxmedia.com';

/** The name we call ourselves in the documents. */
export const LEGAL_NAME = 'Wurx Media';

/** The product these documents are about. */
export const PRODUCT_NAME = 'Wurx Media Hub';

/**
 * The date the documents last changed, written the way a person reads it.
 *
 * Bump this by hand whenever the text changes in a way that matters, and say
 * what changed in DECISIONS.md. It is deliberately not `new Date()`: a document
 * that claims to have been updated today, every day, tells a reader nothing.
 */
export const LEGAL_UPDATED = '1 September 2026';
