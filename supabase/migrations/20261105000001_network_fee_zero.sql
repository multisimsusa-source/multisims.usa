-- The customer pays the crypto network fee on the payment partner's page (NOWPayments adds it
-- for the coin chosen), and the owner pays the partner's service fee from the payout. Our own
-- flat "Network fee" would make the customer pay the network cost twice, so it is 0 by default
-- and on the live settings. The setting stays, so it can come back if the partner ever stops
-- charging it.

alter table public.settings alter column network_fee_cents set default 0;
update public.settings set network_fee_cents = 0;
