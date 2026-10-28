-- Customers showed money they never paid: "Spent" summed every order not cancelled, so an
-- order still awaiting payment counted, and a free replacement moved "Last order". Spent and
-- the order count now cover paid orders only (refunds left out), and the dates ignore
-- replacements.

create or replace view public.customer_contacts with (security_invoker = true) as
select
  customer_email as email,
  (array_agg(customer_name order by created_at desc))[1] as name,
  (array_agg(customer_phone order by created_at desc))[1] as phone,
  count(*) filter (where replacement_of is null and paid_at is not null and status <> 'cancelled') as orders,
  coalesce(sum(total_cents) filter (where paid_at is not null and status <> 'cancelled' and refunded_at is null), 0) as spent_cents,
  coalesce(min(created_at) filter (where replacement_of is null), min(created_at)) as first_order_at,
  coalesce(max(created_at) filter (where replacement_of is null), max(created_at)) as last_order_at
from public.orders
where channel = 'website'
group by customer_email;
