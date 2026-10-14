-- Physical SIMs (agreed 14 Oct 2026): posted first, activated later, so the plan days do
-- not run while the card is in the post. 'shipped' = posted, waiting for the customer to
-- say it arrived or for their chosen start date. Its own migration: a new enum value can
-- only be used once the transaction that adds it has committed.

alter type public.order_status add value if not exists 'shipped' after 'needs_attention';
