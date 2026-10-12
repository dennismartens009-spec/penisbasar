-- ==========================================================
-- Penisbasar – Beispieldaten (optional, nur EINMAL ausführen)
-- Nach schema.sql im SQL Editor ausführen, damit der
-- Marktplatz am Anfang nicht leer ist.
--
-- Die Beispiel-Spieler haben noch keine PIN. Wer sich zuerst
-- mit z. B. "Steve_Baut" anmeldet, legt die PIN fest und
-- übernimmt den Spieler. Zum Entfernen: siehe ganz unten.
-- ==========================================================

insert into public.players (name, bio, joined) values
  ('Steve_Baut',   'Baue gerne große Burgen. Verkaufe Baumaterial in Mengen.',     now() - interval '120 days'),
  ('LunaMinerin',  'Tief unten in den Höhlen unterwegs – meistens abends online.', now() - interval '95 days'),
  ('ErzEule',      'Erze, Erze, Erze. Und ab und zu verzauberte Werkzeuge.',        now() - interval '80 days'),
  ('Kapitaen_Kai', 'Hafen am Spawn, Stand Nr. 3. Einfach vorbeikommen!',            now() - interval '60 days'),
  ('Brotbaron',    'Riesige Weizenfarm. Niemand muss hungern.',                     now() - interval '45 days'),
  ('Netherfux',    'Wohne praktisch im Nether. Obsidian und Seltenes auf Anfrage.', now() - interval '30 days')
on conflict do nothing;

insert into public.offers
  (seller, item, category, amount, price, texture, tint, description, created, status, buyer, final_price, reserved_at, sold_at)
select v.seller, v.item, v.category, v.amount, v.price, v.texture, v.tint, v.description,
       now() - make_interval(hours => v.age),
       v.status, v.buyer,
       case when v.status <> 'verfuegbar' then coalesce(v.deal, v.price) end,
       case when v.status <> 'verfuegbar' then now() - make_interval(hours => v.age) + interval '1 hour' end,
       case when v.status = 'verkauft'   then now() - make_interval(hours => v.age) + interval '3 hours' end
from (values
  ('LunaMinerin',  'Diamantblock',               'bloecke',   1,  10, 'diamond_block', null,      'Glänzt schön in jeder Basis. Neun Diamanten in einem Block.',   3,   'verfuegbar', null,           null),
  ('Steve_Baut',   'Eichenstamm',                'bloecke',   64, 2,  'oak_log',       null,      'Frisch gefällt aus dem Wald hinter dem Spawn.',                 9,   'reserviert', 'Kapitaen_Kai', null),
  ('Steve_Baut',   'Bruchstein',                 'bloecke',   64, 1,  'cobblestone',   null,      'Massenware für große Bauprojekte. Auch größere Mengen möglich.', 30,  'verfuegbar', null,           null),
  ('Kapitaen_Kai', 'Glas',                       'bloecke',   32, 2,  'glass',         null,      'Klar und sauber geschmolzen. Perfekt für Fenster.',             200, 'verkauft',   'Steve_Baut',   null),
  ('Netherfux',    'Obsidian',                   'bloecke',   16, 4,  'obsidian',      null,      'Für Netherportale oder bombensichere Bunker.',                  6,   'verfuegbar', null,           null),
  ('ErzEule',      'Diamanterz',                 'erze',      4,  5,  'diamond_ore',   null,      'Mit Behutsamkeit abgebaut.',                                    300, 'verkauft',   'Netherfux',    null),
  ('ErzEule',      'Eisenerz',                   'erze',      32, 3,  'iron_ore',      null,      'Aus der großen Mine auf Ebene 16.',                             26,  'reserviert', 'Steve_Baut',   null),
  ('LunaMinerin',  'Golderz',                    'erze',      16, 3,  'gold_ore',      null,      '',                                                              150, 'verkauft',   'Kapitaen_Kai', null),
  ('ErzEule',      'Smaragderz',                 'erze',      8,  6,  'emerald_ore',   null,      'Selten! Nur einmal verfügbar.',                                 50,  'verfuegbar', null,           null),
  ('Kapitaen_Kai', 'Redstone-Erz',               'erze',      32, 2,  'redstone_ore',  null,      'Für alle Tüftler und Schaltungs-Fans.',                         60,  'verfuegbar', null,           null),
  ('ErzEule',      'Diamantspitzhacke',          'werkzeuge', 1,  12, null,            '#4fe3d6', 'Effizienz V, Haltbarkeit III, Reparatur. Kaum benutzt.',        12,  'verfuegbar', null,           null),
  ('Steve_Baut',   'Eisenaxt',                   'werkzeuge', 1,  2,  null,            '#b9c3d1', 'Neu geschmiedet, unverzaubert.',                                70,  'verfuegbar', null,           null),
  ('Netherfux',    'Diamant-Brustpanzer',        'ruestung',  1,  14, null,            '#4fe3d6', 'Schutz IV, Haltbarkeit III. Hat mich durch den Nether gebracht.', 18, 'verfuegbar', null,           null),
  ('Kapitaen_Kai', 'Eisenhelm',                  'ruestung',  1,  2,  null,            '#b9c3d1', '',                                                              80,  'verfuegbar', null,           null),
  ('Brotbaron',    'Goldene Karotten',           'essen',     32, 3,  null,            '#f6c94e', 'Die beste Sättigung, die es gibt.',                             90,  'verkauft',   'Netherfux',    null),
  ('Brotbaron',    'Brot',                       'essen',     64, 1,  null,            '#d9a35f', 'Täglich frisch aus der Farm.',                                  260, 'verkauft',   'LunaMinerin',  null),
  ('Brotbaron',    'Gebratenes Schweinefleisch', 'essen',     32, 2,  null,            '#ff8a65', '',                                                              34,  'verfuegbar', null,           null),
  ('Brotbaron',    'Kürbiskuchen',               'essen',     16, 3,  null,            '#f6a94e', 'Frisch gebacken.',                                              50,  'verkauft',   'Steve_Baut',   2),
  ('Netherfux',    'Enderperlen',                'sonstiges', 16, 5,  null,            '#8b7bff', 'Volle Stacks für schnelle Reisen.',                             8,   'verfuegbar', null,           null),
  ('LunaMinerin',  'Namensschild',               'sonstiges', 1,  3,  null,            '#45d49a', 'Gib deinem Haustier einen Namen!',                              55,  'verfuegbar', null,           null),
  ('Kapitaen_Kai', 'Grasblock',                  'bloecke',   64, 2,  'grass',         null,      'Für Gärten, Inseln und alles Grüne.',                           16,  'verfuegbar', null,           null),
  ('Steve_Baut',   'Bruchstein',                 'bloecke',   64, 1,  'cobblestone',   null,      '',                                                              120, 'verkauft',   'ErzEule',      null),
  ('Netherfux',    'Obsidian',                   'bloecke',   16, 4,  'obsidian',      null,      '',                                                              180, 'verkauft',   'Brotbaron',    null),
  ('ErzEule',      'Eisenerz',                   'erze',      32, 3,  'iron_ore',      null,      '',                                                              70,  'verkauft',   'LunaMinerin',  null)
) as v (seller, item, category, amount, price, texture, tint, description, age, status, buyer, deal);

-- Bewertungen zu verkauften Angeboten
insert into public.reviews (offer_id, seller, author, stars, text, created)
select o.id, o.seller, o.buyer, r.stars, r.text, o.sold_at + interval '1 hour'
from (values
  ('Netherfux',    'ErzEule',      'Diamanterz',       5, 'Ehrlicher Händler, gerne wieder.'),
  ('LunaMinerin',  'Brotbaron',    'Brot',             5, 'Bestes Brot auf dem Server.'),
  ('Steve_Baut',   'Kapitaen_Kai', 'Glas',             5, 'Perfektes Glas für meine Burgfenster.'),
  ('Brotbaron',    'Netherfux',    'Obsidian',         4, 'Obsidian wie beschrieben. Treffpunkt im Nether war etwas gruselig 😅'),
  ('Kapitaen_Kai', 'LunaMinerin',  'Golderz',          5, 'Sehr nett, hat mir das Gold sogar zum Hafen gebracht.'),
  ('ErzEule',      'Steve_Baut',   'Bruchstein',       4, 'Alles da, musste nur kurz warten.'),
  ('Netherfux',    'Brotbaron',    'Goldene Karotten', 5, 'Karotten top, Baron ist immer erreichbar.'),
  ('LunaMinerin',  'ErzEule',      'Eisenerz',         5, 'Super schnelle Übergabe, war sogar ein Erz mehr dabei. Danke!')
) as r (buyer, seller, item, stars, text)
join public.offers o on o.buyer = r.buyer and o.seller = r.seller and o.item = r.item and o.status = 'verkauft'
on conflict (offer_id) do nothing;

-- Ein paar offene Preisvorschläge
insert into public.price_offers (offer_id, buyer, amount, created)
select o.id, p.buyer, p.amount, now() - interval '1 hour'
from (values
  ('ErzEule',   'Diamantspitzhacke', 'Steve_Baut',  10),
  ('Netherfux', 'Enderperlen',       'LunaMinerin', 4),
  ('Steve_Baut', 'Eisenaxt',         'Brotbaron',   1)
) as p (seller, item, buyer, amount)
join public.offers o on o.seller = p.seller and o.item = p.item and o.status = 'verfuegbar';

-- ----------------------------------------------------------
-- Beispieldaten später wieder entfernen? Diese Zeilen ausführen:
--
-- delete from public.offers  where seller in ('Steve_Baut','LunaMinerin','ErzEule','Kapitaen_Kai','Brotbaron','Netherfux')
--                               or buyer in ('Steve_Baut','LunaMinerin','ErzEule','Kapitaen_Kai','Brotbaron','Netherfux');
-- delete from public.players where name   in ('Steve_Baut','LunaMinerin','ErzEule','Kapitaen_Kai','Brotbaron','Netherfux');
-- ----------------------------------------------------------
