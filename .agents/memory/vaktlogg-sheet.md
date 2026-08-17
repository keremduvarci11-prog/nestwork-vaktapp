---
name: Vaktlogg Google Sheet
description: Hvilket ark vaktlogg-synken peker på og plasseringsregler
---
- ENESTE gyldige ark (brukerens krav): «Nestwork timer jobbet», ID `1fd7xZET8otXv3uVFThpPq96pKsE3EDidNAMfjuVNZFA`, fane Sheet1 (gridId 0). Alle andre ark (test-ark, «Godkjente vakter») skal IKKE brukes til vaktloggen.
- `VAKT_SHEET_ID` (production env) og kodens fallback peker begge på dette arket.
- Regel: nye vakter sorteres inn på dato INNE i ukeblokken (samme dag samlet), aldri nederst. Ny uke → nederst med én blank rad.
- Kolonne P (skjult) = vakt-ID som kobler rad til appen. Kolonner: A=uke, B=«kode Fornavn», C=barnehage, E=dato dd.mm.yyyy, F/G=tid, H=bruttotimer, K=Ja/Nei (rød ved Nei), L=vikarkode (gul).
- Timeføringskoder i arket vinner over appen: Saada=9088, Ingebjørg=9091 (prod-externalId rettet).
- Bruker republiserte appen ca. 17. aug 2026 — etter det skal synken gå automatisk til originalarket. Før det ble alt backfillet manuelt (t.o.m. Bibi 18–19.08, Sandra uke 35).
- ALLTID sjekk om ansatte allerede har vakter for datoene før nye opprettes (unngå duplikater — skjedde med Gavin/Ingebjørg sep–okt).
