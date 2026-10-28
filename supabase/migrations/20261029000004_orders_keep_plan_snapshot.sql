-- Deleting a plan, a day package or a carrier sets the orders' links to null (on delete set
-- null), but orders_kind_plan_check also required plan_id and day_package_id on every plan
-- order, so the owner could not delete anything that had ever been ordered. An order keeps
-- its own copy of what was bought (plan_name, days), which is what the check now requires.

alter table public.orders
  drop constraint orders_kind_plan_check,
  add constraint orders_kind_plan_check
    check (kind = 'card_only' or (plan_name is not null and days is not null));
