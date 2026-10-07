-- PLACEHOLDER CATALOGUE. Replace (do not edit around) when the client's real carrier list,
-- plan details and prices arrive.
--
-- Prices are deliberately fake: exactly $1 per day plus a whole-dollar step per plan,
-- so nobody mistakes them for real ones. International calling is a flat $5.
-- Day package lengths use the TravSim set until the client picks his own.
-- Never seed reviews.

insert into public.carriers (name, slug, display_order) values
  ('T-Mobile',     't-mobile',     10),
  ('Verizon',      'verizon',      20),
  ('AT&T',         'att',          30),
  ('Lycamobile',   'lycamobile',   40),
  ('Mint Mobile',  'mint-mobile',  50),
  ('Ultra Mobile', 'ultra-mobile', 60);

with c as (select id, slug from public.carriers)
insert into public.plans (
  carrier_id, name, slug, product_type, talk, sms, data_gb, hotspot_gb, network,
  slowdown_after_gb, slowdown_speed, countries_covered, summary, description, published, display_order
)
select c.id, p.name, p.slug, p.product_type::public.product_type, p.talk, p.sms, p.data_gb, p.hotspot_gb,
       p.network, p.slowdown_after_gb, p.slowdown_speed, p.countries, p.summary, p.description, true, p.ord
from c
join (values
  ('t-mobile', 'Unlimited Plus', 't-mobile-unlimited-plus-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', null::numeric, 10::numeric, '5G / 4G LTE', 50::numeric, '1.5 Mbps',
   array['United States', 'Mexico', 'Canada'],
   'Unlimited data on T-Mobile 5G with 10 GB hotspot.',
   'A full unlimited line on the T-Mobile network. Talk and text across the US without limits, priority 5G data for the first 50 GB, then unlimited data at reduced speed. Includes 10 GB of mobile hotspot so you can share with a laptop or tablet. Works in Mexico and Canada too.',
   10),
  ('t-mobile', 'Essentials 20 GB', 't-mobile-essentials-20gb-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', 20, 5, '5G / 4G LTE', 20, '256 kbps',
   array['United States'],
   '20 GB of high-speed T-Mobile data for lighter use.',
   'A lighter T-Mobile line for maps, messaging and social. 20 GB of high-speed 5G and 4G LTE data, then reduced speed for the rest of your package. Unlimited talk and text inside the US and 5 GB of hotspot.',
   20),
  ('t-mobile', 'Unlimited Plus SIM', 't-mobile-unlimited-plus-sim', 'physical',
   'Unlimited US talk', 'Unlimited US text', null, 10, '5G / 4G LTE', 50, '1.5 Mbps',
   array['United States', 'Mexico', 'Canada'],
   'The Unlimited Plus line as a physical SIM, posted to you.',
   'The same unlimited T-Mobile line as our eSIM, on a physical tri-cut SIM card for phones without eSIM support. Posted from the US by USPS with a tracking number.',
   30),

  ('verizon', 'Unlimited Welcome', 'verizon-unlimited-welcome-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', null, 5, '5G / 4G LTE', 30, '3 Mbps',
   array['United States'],
   'Unlimited data on the Verizon network.',
   'A full unlimited line on the Verizon network. Unlimited talk and text, priority data for the first 30 GB, then unlimited at reduced speed. Includes 5 GB of hotspot.',
   10),
  ('verizon', 'Prepaid 15 GB', 'verizon-prepaid-15gb-sim', 'physical',
   'Unlimited US talk', 'Unlimited US text', 15, null, '4G LTE', 15, '128 kbps',
   array['United States'],
   '15 GB on Verizon 4G LTE on a physical SIM.',
   'A simple Verizon line with 15 GB of 4G LTE data for travellers who mostly need maps, messages and email. Unlimited talk and text inside the US. Posted from the US by USPS with a tracking number.',
   20),

  ('att', 'Unlimited Starter', 'att-unlimited-starter-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', null, 10, '5G / 4G LTE', 50, '1.5 Mbps',
   array['United States', 'Mexico', 'Canada'],
   'Unlimited AT&T data with 10 GB hotspot.',
   'A full unlimited line on AT&T. Unlimited talk and text across the US, priority 5G data for the first 50 GB, then unlimited data at reduced speed. Includes 10 GB of hotspot and use in Mexico and Canada.',
   10),
  ('att', 'Prepaid 25 GB', 'att-prepaid-25gb-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', 25, 5, '5G / 4G LTE', 25, '256 kbps',
   array['United States'],
   '25 GB of AT&T high-speed data.',
   '25 GB of high-speed AT&T data with unlimited talk and text inside the US. After 25 GB, data continues at reduced speed until your package ends. Includes 5 GB of hotspot.',
   20),
  ('att', 'Unlimited Starter SIM', 'att-unlimited-starter-sim', 'physical',
   'Unlimited US talk', 'Unlimited US text', null, 10, '5G / 4G LTE', 50, '1.5 Mbps',
   array['United States', 'Mexico', 'Canada'],
   'The Unlimited Starter line as a physical SIM.',
   'The same unlimited AT&T line as our eSIM, on a physical tri-cut SIM card. Posted from the US by USPS with a tracking number.',
   30),

  ('lycamobile', 'Unlimited Talk 10 GB', 'lycamobile-10gb-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', 10, null, '5G / 4G LTE', 10, '128 kbps',
   array['United States'],
   'Budget Lycamobile line with 10 GB of data.',
   'An affordable line on the Lycamobile network, which runs on T-Mobile towers. 10 GB of high-speed data with unlimited talk and text inside the US.',
   10),
  ('lycamobile', 'Unlimited Talk 10 GB SIM', 'lycamobile-10gb-sim', 'physical',
   'Unlimited US talk', 'Unlimited US text', 10, null, '5G / 4G LTE', 10, '128 kbps',
   array['United States'],
   'The 10 GB Lycamobile line on a physical SIM.',
   'The same 10 GB Lycamobile line on a physical tri-cut SIM card. Posted from the US by USPS with a tracking number.',
   20),

  ('mint-mobile', 'Unlimited', 'mint-mobile-unlimited-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', null, 5, '5G / 4G LTE', 40, '1 Mbps',
   array['United States'],
   'Unlimited Mint Mobile data on T-Mobile towers.',
   'Mint Mobile runs on the T-Mobile 5G network. Unlimited talk and text, priority data for the first 40 GB, then unlimited at reduced speed. Includes 5 GB of hotspot.',
   10),
  ('mint-mobile', '5 GB Starter', 'mint-mobile-5gb-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', 5, 5, '5G / 4G LTE', 5, '128 kbps',
   array['United States'],
   'A small Mint Mobile line for short trips.',
   'Enough data for maps and messages on a short stay. 5 GB of high-speed data on the T-Mobile 5G network with unlimited talk and text inside the US.',
   20),

  ('ultra-mobile', 'Unlimited International', 'ultra-mobile-unlimited-international-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', null, 5, '5G / 4G LTE', 30, '1 Mbps',
   array['United States'],
   'Unlimited data with calling home included on Ultra Mobile.',
   'Ultra Mobile is built for people who call abroad. Unlimited talk and text inside the US, priority data for the first 30 GB, then unlimited at reduced speed. Runs on the T-Mobile network.',
   10),
  ('ultra-mobile', 'Unlimited International SIM', 'ultra-mobile-unlimited-international-sim', 'physical',
   'Unlimited US talk', 'Unlimited US text', null, 5, '5G / 4G LTE', 30, '1 Mbps',
   array['United States'],
   'The Ultra Mobile unlimited line on a physical SIM.',
   'The same Ultra Mobile line on a physical tri-cut SIM card. Posted from the US by USPS with a tracking number.',
   20)
) as p(carrier_slug, name, slug, product_type, talk, sms, data_gb, hotspot_gb, network,
       slowdown_after_gb, slowdown_speed, countries, summary, description, ord)
  on p.carrier_slug = c.slug;

-- Dummy prices: $1 per day + a whole-dollar step that differs per plan.
insert into public.day_packages (plan_id, days, price_cents, wholesale_price_cents)
select p.id, d.days,
       (d.days + (row_number() over (partition by d.days order by p.slug))::int - 1) * 100,
       null
from public.plans p
cross join (values (1), (7), (10), (14), (21), (30), (60)) as d(days);

insert into public.addons (code, name, description, price_cents) values
  ('intl_calling', 'International calling',
   'Call numbers outside the US from your US line.', 500);
