/*
 * Let the Edge Function actually call the content functions.
 *
 * The previous migration revoked EXECUTE from `public` on all four, which is
 * right, and then failed to grant it back to `service_role`, which is not:
 * service_role's access came THROUGH `public`, so revoking it there took the
 * Edge Function's access with it. Every write came back "permission denied for
 * function submit_content".
 *
 * The other write paths in this project (apply_for_offer, save_brand,
 * save_offer) all revoke and then grant in the same breath. These four were
 * the ones that only did the first half.
 */

grant execute on function public.submit_content(
  uuid, uuid, text, text, boolean, text, text, text, text
) to service_role;

grant execute on function public.update_content(
  uuid, uuid, text, text, boolean, text, text, text, text
) to service_role;

grant execute on function public.delete_content(uuid, uuid) to service_role;

grant execute on function public.review_content(
  uuid, uuid, public.content_status, text
) to service_role;
