-- Quick validation for catalog + compatibility rules

-- Rule hit: R740 should include Xeon Gold 6244
select cm.id, cm.model
from public.get_compatible_components('11111111-1111-1111-1111-111111111111', null) cm
where cm.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Tag fallback: Nexus 9000 should include SFP28 optics (tag match)
select cm.id, cm.model, cm.tags
from public.get_compatible_components('55555555-5555-5555-5555-555555555555', null) cm
where 'sfp28' = any(cm.tags);

-- Union view check
select scope, count(*) as rule_count
from public.compat_rules_union_models
group by scope
order by scope;
